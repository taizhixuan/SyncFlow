import { randomUUID } from 'node:crypto';

const MAX_NAME_LENGTH = 100;

/**
 * Make a user-supplied file name safe as the last segment of an object key:
 * no path separators, spaces become hyphens, anything outside a conservative
 * ASCII set becomes `_`, and the length is capped.
 */
export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[/\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '_');
  const capped = cleaned.length > MAX_NAME_LENGTH ? cleaned.slice(-MAX_NAME_LENGTH) : cleaned;
  return capped || 'file';
}

/** Object-key prefix of every upload that belongs to a board. */
export function boardAssetPrefix(boardId: string): string {
  return `boards/${boardId}/`;
}

/**
 * Unique object key scoped to the board it belongs to:
 * `boards/{boardId}/{uuid}-{sanitizedFileName}`.
 */
export function objectKeyFor(boardId: string, fileName: string): string {
  return `${boardAssetPrefix(boardId)}${randomUUID()}-${sanitizeFileName(fileName)}`;
}

/** Unique object key for a profile avatar: `avatars/{userId}/{uuid}-{sanitizedFileName}`. */
export function avatarKeyFor(userId: string, fileName: string): string {
  return `avatars/${userId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

/** Public asset URL for a key; each segment is percent-encoded, separators kept. */
export function assetUrlFor(
  s3config: { endpoint?: string; bucket?: string },
  key: string,
): string {
  const endpoint = s3config.endpoint ?? '';
  const bucket = s3config.bucket ?? '';
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${endpoint}/${bucket}/${encodedKey}`;
}

/**
 * The object key behind a public asset URL from `assetUrlFor`, or null when the
 * URL points anywhere else (another host or bucket, or a malformed encoding).
 */
export function assetKeyFromUrl(
  s3config: { endpoint?: string; bucket?: string },
  url: string,
): string | null {
  const base = assetUrlFor(s3config, '');
  if (!url.startsWith(base) || url.length === base.length) return null;
  try {
    return url.slice(base.length).split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}
