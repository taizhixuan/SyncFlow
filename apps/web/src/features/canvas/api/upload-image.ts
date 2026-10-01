import type { PresignedUpload } from '@syncflow/shared';
import { api } from '@/lib/api';

export interface UploadResult {
  assetUrl: string;
  width: number;
  height: number;
}

/** Mirrors the API allow-list; SVG is refused server-side (scriptable). */
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function probeDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

/**
 * Presign via `path`, then PUT the file. The API signs the exact size and
 * type into the upload URL, so the PUT must send this same file with this
 * same Content-Type or storage rejects it.
 */
async function presignAndPut(
  path: string,
  file: File,
  extra: Record<string, string> = {},
): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Unsupported image type — use PNG, JPEG, GIF or WebP.');
  }
  const { uploadUrl, assetUrl } = await api.post<PresignedUpload>(path, {
    ...extra,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  }

  const { width, height } = await probeDimensions(assetUrl);
  return { assetUrl, width, height };
}

/** Upload an image onto a board; the caller must be the board's owner or an editor. */
export function uploadImage(file: File, boardId: string): Promise<UploadResult> {
  return presignAndPut('/storage/uploads', file, { boardId });
}

/** Upload the signed-in user's profile avatar (max 2 MB); resolves its public URL. */
export async function uploadAvatar(file: File): Promise<string> {
  const { assetUrl } = await presignAndPut('/storage/avatar-uploads', file);
  return assetUrl;
}
