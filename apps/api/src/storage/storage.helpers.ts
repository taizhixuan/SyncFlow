import { randomUUID } from 'crypto';

/** Strip path separators, replace spaces with hyphens, keep the rest */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[/\\]/g, '')
    .replace(/\s+/g, '-');
}

/** Generate a unique object key: uploads/{userId}/{uuid}-{sanitizedFileName} */
export function objectKeyFor(userId: string, fileName: string): string {
  return `uploads/${userId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

/** Derive the public asset URL for a key using the S3 config */
export function assetUrlFor(
  s3config: { endpoint?: string; bucket?: string },
  key: string,
): string {
  const endpoint = s3config.endpoint ?? '';
  const bucket = s3config.bucket ?? '';
  return `${endpoint}/${bucket}/${key}`;
}
