import { z } from 'zod';

/** A presigned PUT for one upload: PUT the bytes to `uploadUrl`, then use `assetUrl`. */
export const presignedUploadSchema = z.object({
  uploadUrl: z.string().url(),
  assetUrl: z.string().url(),
  key: z.string(),
});
export type PresignedUpload = z.infer<typeof presignedUploadSchema>;
