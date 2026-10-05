import { useMemo } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type MutationKey,
} from '@tanstack/react-query';
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
 * The caller's boards, a page at a time, narrowed by the server. Keyed under
 * `['boards']` so every mutation that invalidates that key refetches all loaded
 * pages of every filter. While a new filter loads, the previous list stays up
 * instead of flashing skeletons on every keystroke.
 */
export function useBoards(filter: boardsApi.BoardListFilter = {}) {
  const q = filter.q?.trim() ?? '';
  const query: boardsApi.BoardListFilter = {
    ...(filter.role && { role: filter.role }),
    ...(q && { q }),
  };
  return useInfiniteQuery({
    queryKey: ['boards', filter.role ?? 'all', q],
    queryFn: ({ pageParam }) => boardsApi.listBoards(pageParam, query),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursorOf<Board>,
    placeholderData: keepPreviousData,
  });
}

/** Per-board dashboard actions; their keys let a page see every one in flight. */
export const DELETE_BOARD_KEY = ['boards', 'delete'] as const;
export const DUPLICATE_BOARD_KEY = ['boards', 'duplicate'] as const;
export const LEAVE_BOARD_KEY = ['boards', 'leave'] as const;

/**
 * Hook-level callbacks run for every mutate() call. Callbacks passed to
 * mutate() itself only reach the latest call, so a page that fires the same
 * action for several boards at once must use these to see every failure.
 */
export interface BoardActionOptions {
  onError?: (error: Error, boardId: string) => void;
}

/**
 * Ids of the boards with a `mutationKey` action still running: all of them,
 * whereas a mutation's own `isPending`/`variables` only describe its latest call.
 */
export function usePendingBoardIds(mutationKey: MutationKey): Set<string> {
  const ids = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (mutation) => mutation.state.variables as string,
  });
  return useMemo(() => new Set(ids), [ids]);
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

export function useDeleteBoard(options: BoardActionOptions = {}) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationKey: DELETE_BOARD_KEY,
    mutationFn: (id) => boardsApi.deleteBoard(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['boards'] }),
    onError: options.onError,
  });
}

export function useDuplicateBoard(options: BoardActionOptions = {}) {
  const qc = useQueryClient();
  return useMutation<Board, Error, string>({
    mutationKey: DUPLICATE_BOARD_KEY,
    mutationFn: (id) => boardsApi.duplicateBoard(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['boards'] }),
    onError: options.onError,
  });
}

/**
 * Leave a board you don't own. Cached board detail is dropped since we no longer
 * have access — but only inactive entries: removing one the open board page still
 * observes would make it refetch (and 403) before the caller navigates away.
 */
export function useLeaveBoard(options: BoardActionOptions = {}) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationKey: LEAVE_BOARD_KEY,
    mutationFn: (id) => boardsApi.leaveBoard(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ['board', id], type: 'inactive' });
      void qc.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: options.onError,
  });
}
