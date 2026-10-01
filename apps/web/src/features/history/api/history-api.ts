import type { BoardVersion, VersionRestored } from '@syncflow/shared';
import { api } from '@/lib/api';

export function listVersions(boardId: string): Promise<BoardVersion[]> {
  return api.get(`/boards/${boardId}/versions`);
}
export function restoreVersion(
  boardId: string,
  docVersion: number,
): Promise<VersionRestored> {
  return api.post(`/boards/${boardId}/versions/${docVersion}/restore`);
}
