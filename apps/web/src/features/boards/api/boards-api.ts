import type { Board, BoardListResponse } from '@syncflow/shared';
import { api } from '@/lib/api';
import { pagedPath } from './paged-path';

export const BOARDS_PAGE_SIZE = 24;

export function listBoards(cursor: string | null): Promise<BoardListResponse> {
  return api.get(pagedPath('/boards', BOARDS_PAGE_SIZE, cursor));
}
export function createBoard(title?: string): Promise<Board> {
  return api.post('/boards', { title });
}
export function getBoard(id: string): Promise<Board> {
  return api.get(`/boards/${id}`);
}
export function renameBoard(id: string, title: string): Promise<Board> {
  return api.patch(`/boards/${id}`, { title });
}
export function deleteBoard(id: string): Promise<void> {
  return api.del(`/boards/${id}`);
}
export function duplicateBoard(id: string): Promise<Board> {
  return api.post(`/boards/${id}/duplicate`);
}
/** Editors and viewers only; the owner gets a 409 until they transfer ownership. */
export function leaveBoard(id: string): Promise<void> {
  return api.del(`/boards/${id}/members/me`);
}
