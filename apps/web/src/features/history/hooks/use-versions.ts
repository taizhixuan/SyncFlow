import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardVersion } from '@syncflow/shared';
import * as historyApi from '../api/history-api';

export function useVersions(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId, 'versions'],
    queryFn: () => historyApi.listVersions(boardId),
    enabled: boardId !== 'local',
  });
}

export function useRestoreVersion(boardId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: true; docVersion: number }, Error, number>({
    mutationFn: (docVersion) => historyApi.restoreVersion(boardId, docVersion),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['board', boardId, 'versions'] }),
  });
}

export type { BoardVersion };
