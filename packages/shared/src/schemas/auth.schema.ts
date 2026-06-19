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

export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(60),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;
