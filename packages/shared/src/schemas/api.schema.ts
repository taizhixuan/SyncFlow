import { z } from 'zod';

/**
 * The JSON body of every API error (the global exception filter's envelope).
 * `message` is a list for validation failures (one entry per problem).
 */
export const errorEnvelopeSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.union([z.string(), z.array(z.string())]),
  requestId: z.string().optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Body of endpoints that only confirm success. */
export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;
