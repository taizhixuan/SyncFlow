import { z } from 'zod';
import { paginated } from './pagination.schema';

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

/** GET /boards — the caller's boards, most recently updated first. */
export const boardListResponseSchema = paginated(boardSchema);
export type BoardListResponse = z.infer<typeof boardListResponseSchema>;

/** GET /boards/:id/members — members in join order. */
export const boardMemberListResponseSchema = paginated(boardMemberSchema);
export type BoardMemberListResponse = z.infer<typeof boardMemberListResponseSchema>;

/**
 * POST /boards/:id/members (owner only). The API trims and lowercases the email;
 * the response is the new member in the same shape as a members-list item.
 */
export const addMemberRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['editor', 'viewer']),
});
export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;

/** POST /boards/:id/transfer-ownership (owner only); responds with the board. */
export const transferOwnershipRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;

/** 409 message from DELETE /boards/:id/members/me when the caller owns the board. */
export const OWNER_CANNOT_LEAVE_MESSAGE = 'Transfer ownership before leaving';

export const boardVersionSchema = z.object({
  docVersion: z.number().int(),
  reason: z.enum(['autosave', 'restore', 'manual']),
  createdBy: z.string().uuid().nullable(),
  /** The author's current display name; null for system saves or a deleted user. */
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type BoardVersion = z.infer<typeof boardVersionSchema>;
