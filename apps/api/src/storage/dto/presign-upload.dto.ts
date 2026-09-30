import { IsIn, IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB — rendered at thumbnail size

/**
 * Raster formats the canvas can render. SVG is deliberately excluded: served
 * from the bucket origin it can run script (stored XSS).
 */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const TYPE_MESSAGE = `contentType must be one of ${ALLOWED_IMAGE_TYPES.join(', ')}`;

/** Presign a profile-avatar upload; scoped to the caller, no board involved. */
export class PresignAvatarUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @IsIn(ALLOWED_IMAGE_TYPES, { message: TYPE_MESSAGE })
  contentType!: AllowedImageType;

  /** Exact byte size; it is signed into the upload URL, so S3 rejects any other length. */
  @IsInt()
  @Min(1)
  @Max(MAX_AVATAR_SIZE)
  size!: number;
}

/** Presign an image placed on a board; authorized per board (owner/editor). */
export class PresignUploadDto {
  @IsUUID()
  boardId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @IsIn(ALLOWED_IMAGE_TYPES, { message: TYPE_MESSAGE })
  contentType!: AllowedImageType;

  /** Exact byte size; it is signed into the upload URL, so S3 rejects any other length. */
  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_SIZE)
  size!: number;
}
