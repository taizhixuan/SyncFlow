import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Board } from '@syncflow/shared';
import * as boardsApi from '../api/boards-api';

export function useBoards() {
  return useQuery({ queryKey: ['boards'], queryFn: boardsApi.listBoards });
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
