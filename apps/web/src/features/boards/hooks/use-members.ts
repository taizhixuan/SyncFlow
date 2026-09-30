import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as membersApi from '../api/members-api';
import type { AssignableRole } from '../api/members-api';

export function membersQueryKey(boardId: string): readonly string[] {
  return ['board', boardId, 'members'];
}

/** Membership changes ripple into the member list, invites, the board's own role/count, and the dashboard. */
function invalidateMembership(qc: QueryClient, boardId: string): void {
  void qc.invalidateQueries({ queryKey: membersQueryKey(boardId) });
  void qc.invalidateQueries({ queryKey: ['board', boardId, 'invites'] });
  void qc.invalidateQueries({ queryKey: ['board', boardId] });
  void qc.invalidateQueries({ queryKey: ['boards'] });
}

export function useMembers(boardId: string, enabled: boolean) {
  return useQuery({
    queryKey: membersQueryKey(boardId),
    queryFn: () => membersApi.listMembers(boardId),
    enabled,
  });
}

export function useUpdateMemberRole(boardId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { userId: string; role: AssignableRole }>({
    mutationFn: ({ userId, role }) => membersApi.updateMemberRole(boardId, userId, role),
    onSettled: () => invalidateMembership(qc, boardId),
  });
}

export function useRemoveMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (userId) => membersApi.removeMember(boardId, userId),
    onSuccess: () => invalidateMembership(qc, boardId),
  });
}
