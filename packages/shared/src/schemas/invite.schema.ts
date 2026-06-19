import { z } from 'zod';
import { boardRoleSchema } from './board.schema';

export const inviteKindSchema = z.enum(['email', 'share_link']);
export type InviteKind = z.infer<typeof inviteKindSchema>;

export const createInviteRequestSchema = z.object({
  kind: inviteKindSchema,
  role: z.enum(['editor', 'viewer']),
  email: z.string().email().optional(),
  expiresInHours: z.number().int().positive().optional(),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const invitePreviewSchema = z.object({
  valid: z.boolean(),
  boardTitle: z.string().optional(),
  role: boardRoleSchema.optional(),
  inviterName: z.string().optional(),
  kind: inviteKindSchema.optional(),
  expired: z.boolean().optional(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export const inviteCreatedSchema = z.object({
  token: z.string(),
  inviteUrl: z.string().url(),
  role: z.enum(['editor', 'viewer']),
  kind: inviteKindSchema,
  expiresAt: z.string(),
});
export type InviteCreated = z.infer<typeof inviteCreatedSchema>;

export const boardInviteSummarySchema = z.object({
  id: z.string().uuid(),
  kind: inviteKindSchema,
  email: z.string().email().nullable().optional(),
  role: boardRoleSchema,
  expiresAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
});
export type BoardInviteSummary = z.infer<typeof boardInviteSummarySchema>;
