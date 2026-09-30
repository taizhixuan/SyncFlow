import type { BoardMember } from '@syncflow/shared';
import { api } from '@/lib/api';

/** Roles an owner can assign; ownership itself is never transferable here. */
export type AssignableRole = 'editor' | 'viewer';

export function listMembers(boardId: string): Promise<BoardMember[]> {
  return api.get(`/boards/${boardId}/members`);
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
