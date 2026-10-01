import type {
  BoardInviteListResponse,
  CreateInviteRequest,
  InviteAccepted,
  InviteCreated,
  InvitePreview,
} from '@syncflow/shared';
import { api } from '@/lib/api';
import { pagedPath } from './paged-path';

export function createInvite(boardId: string, body: CreateInviteRequest): Promise<InviteCreated> {
  return api.post(`/boards/${boardId}/invites`, body);
}

export function getInvitePreview(token: string): Promise<InvitePreview> {
  return api.get(`/invites/${token}`);
}

export function acceptInvite(token: string): Promise<InviteAccepted> {
  return api.post(`/invites/${token}/accept`);
}

export const INVITES_PAGE_SIZE = 20;

export function listInvites(boardId: string, cursor: string | null): Promise<BoardInviteListResponse> {
  return api.get(pagedPath(`/boards/${boardId}/invites`, INVITES_PAGE_SIZE, cursor));
}

export function revokeInvite(boardId: string, inviteId: string): Promise<void> {
  return api.del(`/boards/${boardId}/invites/${inviteId}`);
}
