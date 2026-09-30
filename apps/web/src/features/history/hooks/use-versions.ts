import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardVersion } from '@syncflow/shared';
import * as historyApi from '../api/history-api';

/** Board versions; pass `enabled` = panel open so a closed panel costs no request. */
export function useVersions(boardId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['board', boardId, 'versions'],
    queryFn: () => historyApi.listVersions(boardId),
    enabled: enabled && boardId !== 'local',
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
