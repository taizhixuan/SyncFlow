import { describe, expect, it } from 'vitest';
import {
  createInviteRequestSchema,
  invitePreviewSchema,
  inviteCreatedSchema,
  boardInviteSummarySchema,
} from './invite.schema';

describe('invite schemas', () => {
  it('validates a valid email invite request', () => {
    const result = createInviteRequestSchema.safeParse({ kind: 'email', role: 'editor', email: 'a@b.com' });
    expect(result.success).toBe(true);
  });

  it('validates a share_link invite request without email', () => {
    const result = createInviteRequestSchema.safeParse({ kind: 'share_link', role: 'viewer' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown role', () => {
    const result = createInviteRequestSchema.safeParse({ kind: 'share_link', role: 'owner' });
    expect(result.success).toBe(false);
  });

  it('validates InvitePreview', () => {
    const result = invitePreviewSchema.safeParse({
      valid: true,
      boardTitle: 'My Board',
      role: 'editor',
      inviterName: 'Alice',
      kind: 'email',
    });
    expect(result.success).toBe(true);
  });

  it('validates InviteCreated', () => {
    const result = inviteCreatedSchema.safeParse({
      token: 'abc',
      inviteUrl: 'http://localhost:5173/invite/abc',
      role: 'editor',
      kind: 'share_link',
      expiresAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('validates BoardInviteSummary', () => {
    const result = boardInviteSummarySchema.safeParse({
      id: '00000000-0000-0000-0000-000000000000',
      kind: 'email',
      email: 'a@b.com',
      role: 'editor',
      expiresAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
