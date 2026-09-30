import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Board, Paginated } from '@syncflow/shared';
import * as boardsApi from '../api/boards-api';

/** Flatten an infinite query's pages into one list, in page order. */
export function flattenPages<T>(data: { pages: Paginated<T>[] } | undefined): T[] {
  return data ? data.pages.flatMap((p) => p.items) : [];
}

/** Next-page cursor for any paginated list; `undefined` tells TanStack there is no next page. */
export function nextCursorOf<T>(last: Paginated<T>): string | undefined {
  return last.nextCursor ?? undefined;
}

/**
 * The caller's boards, a page at a time. Keyed `['boards']` so every mutation that
 * invalidates that key refetches all loaded pages.
 */
export function useBoards() {
  return useInfiniteQuery({
    queryKey: ['boards'],
    queryFn: ({ pageParam }) => boardsApi.listBoards(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursorOf<Board>,
  });
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: ['board', id],
    queryFn: () => boardsApi.getBoard(id),
    enabled: id !== 'local',
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation<Board, Error, string | undefined>({
    mutationFn: (title) => boardsApi.createBoard(title),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['boards'] }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => boardsApi.deleteBoard(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['boards'] }),
  });
}

export function useDuplicateBoard() {
  const qc = useQueryClient();
  return useMutation<Board, Error, string>({
    mutationFn: (id) => boardsApi.duplicateBoard(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['boards'] }),
  });
}

/**
 * Leave a board you don't own. Cached board detail is dropped since we no longer
 * have access — but only inactive entries: removing one the open board page still
 * observes would make it refetch (and 403) before the caller navigates away.
 */
export function useLeaveBoard() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => boardsApi.leaveBoard(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ['board', id], type: 'inactive' });
      void qc.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}
