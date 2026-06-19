import type { BoardInviteSummary, CreateInviteRequest, InviteCreated, InvitePreview } from '@syncflow/shared';
import { api } from '@/lib/api';

export function createInvite(boardId: string, body: CreateInviteRequest): Promise<InviteCreated> {
  return api.post(`/boards/${boardId}/invites`, body);
}

export function getInvitePreview(token: string): Promise<InvitePreview> {
  return api.get(`/invites/${token}`);
}

export function acceptInvite(token: string): Promise<{ boardId: string; role: string }> {
  return api.post(`/invites/${token}/accept`);
}

export function listInvites(boardId: string): Promise<BoardInviteSummary[]> {
  return api.get(`/boards/${boardId}/invites`);
}

export function revokeInvite(boardId: string, inviteId: string): Promise<void> {
  return api.del(`/boards/${boardId}/invites/${inviteId}`);
}
