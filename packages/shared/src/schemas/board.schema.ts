import { z } from 'zod';

export const boardRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type BoardRole = z.infer<typeof boardRoleSchema>;

/** A board as returned to a member, including the caller's own role on it. */
export const boardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  ownerId: z.string().uuid(),
  role: boardRoleSchema,
  thumbnailUrl: z.string().nullable().optional(),
  isPublic: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Board = z.infer<typeof boardSchema>;

export const boardMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email(),
  color: z.string(),
  role: boardRoleSchema,
  acceptedAt: z.string().nullable().optional(),
});
export type BoardMember = z.infer<typeof boardMemberSchema>;

export const createBoardRequestSchema = z.object({
  title: z.string().max(120).optional(),
});
export type CreateBoardRequest = z.infer<typeof createBoardRequestSchema>;

export const updateBoardRequestSchema = z.object({
  title: z.string().min(1).max(120),
});
export type UpdateBoardRequest = z.infer<typeof updateBoardRequestSchema>;

export const addMemberRequestSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']),
});
export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;
