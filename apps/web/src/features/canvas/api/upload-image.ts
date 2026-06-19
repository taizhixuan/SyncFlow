import { api } from '@/lib/api';

interface PresignResponse {
  uploadUrl: string;
  assetUrl: string;
  key: string;
}

export interface UploadResult {
  assetUrl: string;
  width: number;
  height: number;
}

function probeDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const { uploadUrl, assetUrl } = await api.post<PresignResponse>(
    '/storage/uploads',
    { fileName: file.name, contentType: file.type, size: file.size },
  );

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
