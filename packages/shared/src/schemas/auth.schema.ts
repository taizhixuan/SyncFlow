import { z } from 'zod';

/** A user as exposed across the API boundary — never includes the password hash. */
export const userPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  color: z.string(),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

/** Response from signup/login/refresh. The refresh token rides in an httpOnly cookie. */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: userPublicSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/**
 * A string whose length is counted in characters (code points), as the API's
 * class-validator rules count it — zod's own min/max count UTF-16 units, so an
 * emoji would count twice. Issues keep zod's too_small/too_big codes.
 */
function charLength(min: number, max: number, base: z.ZodString = z.string()) {
  return base.superRefine((value, ctx) => {
    const length = [...value].length;
    if (length < min) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: min,
        type: 'string',
        inclusive: true,
      });
    } else if (length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: max,
        type: 'string',
        inclusive: true,
      });
    }
  });
}

/**
 * Request schemas for the auth forms. They reject only what the API would
 * also reject: the API owns the full email rules (class-validator's IsEmail,
 * which accepts e.g. `josé@example.com`), and a stricter client check would
 * lock those accounts out.
 */
export const signupRequestSchema = z.object({
  // One @ with something either side and no spaces; the API judges the rest.
  email: z.string().regex(/^[^\s@]+@[^\s@]+$/),
  password: charLength(8, 200),
  // The API trims the name before checking it.
  displayName: charLength(1, 60, z.string().trim()),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  // Any existing account's address must reach the API, so only require one.
  email: z.string().min(1),
  // Same cap as signup: the API refuses longer inputs before hashing them.
  password: charLength(1, 200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;
