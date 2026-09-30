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

/**
 * Unique object key scoped to the board it belongs to:
 * `boards/{boardId}/{uuid}-{sanitizedFileName}`.
 */
export function objectKeyFor(boardId: string, fileName: string): string {
  return `boards/${boardId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
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
