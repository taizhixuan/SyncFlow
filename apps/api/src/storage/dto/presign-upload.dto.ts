import { IsString, IsNumber, Matches, Min, Max } from 'class-validator';

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export class PresignUploadDto {
  @IsString()
  fileName!: string;

  @IsString()
  @Matches(/^image\//, { message: 'contentType must be an image/* mime type' })
  contentType!: string;

  @IsNumber()
  @Min(1)
  @Max(MAX_IMAGE_SIZE)
  size!: number;
}
