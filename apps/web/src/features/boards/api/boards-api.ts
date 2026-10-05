import type { Board, BoardListResponse, BoardOwnershipFilter } from '@syncflow/shared';
import { api } from '@/lib/api';
import { pagedPath } from './paged-path';

export const BOARDS_PAGE_SIZE = 24;

/** Server-side narrowing of the board list (see `boardListQuerySchema`). */
export interface BoardListFilter {
  role?: BoardOwnershipFilter;
  q?: string;
}

export function listBoards(
  cursor: string | null,
  filter: BoardListFilter = {},
): Promise<BoardListResponse> {
  const params = new URLSearchParams();
  if (filter.role) params.set('role', filter.role);
  const q = filter.q?.trim();
  if (q) params.set('q', q);
  const path = pagedPath('/boards', BOARDS_PAGE_SIZE, cursor);
  const extra = params.toString();
  return api.get(extra ? `${path}&${extra}` : path);
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
