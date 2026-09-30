import type {
  AddMemberRequest,
  Board,
  BoardMember,
  BoardMemberListResponse,
} from '@syncflow/shared';
import { api } from '@/lib/api';
import { pagedPath } from './paged-path';

/** Roles an owner can assign directly; ownership moves only via transferOwnership. */
export type AssignableRole = 'editor' | 'viewer';

export const MEMBERS_PAGE_SIZE = 20;

export function listMembers(boardId: string, cursor: string | null): Promise<BoardMemberListResponse> {
  return api.get(pagedPath(`/boards/${boardId}/members`, MEMBERS_PAGE_SIZE, cursor));
}

export function updateMemberRole(
  boardId: string,
  userId: string,
  role: AssignableRole,
): Promise<{ ok: true }> {
  return api.patch(`/boards/${boardId}/members/${userId}`, { role });
}

/** Also revokes every share link on the board (server-side), so removed members can't rejoin. */
export function removeMember(boardId: string, userId: string): Promise<void> {
  return api.del(`/boards/${boardId}/members/${userId}`);
}

/** 404 when no account uses the email; 409 when that account is already a member. */
export function addMember(boardId: string, body: AddMemberRequest): Promise<BoardMember> {
  return api.post(`/boards/${boardId}/members`, body);
}

/** Owner only. The previous owner becomes an editor; responds with the updated board. */
export function transferOwnership(boardId: string, userId: string): Promise<Board> {
  return api.post(`/boards/${boardId}/transfer-ownership`, { userId });
}
