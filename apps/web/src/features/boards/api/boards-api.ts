import type { Board } from '@syncflow/shared';
import { api } from '@/lib/api';

export function listBoards(): Promise<{ items: Board[] }> {
  return api.get('/boards');
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
