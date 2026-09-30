import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { AddMemberRequest, Board, BoardInviteSummary, BoardMember } from '@syncflow/shared';
import { listInvites } from '../api/invites-api';
import * as membersApi from '../api/members-api';
import type { AssignableRole } from '../api/members-api';
import { nextCursorOf } from './use-boards';

export function membersQueryKey(boardId: string): readonly string[] {
  return ['board', boardId, 'members'];
}

export function invitesQueryKey(boardId: string): readonly string[] {
  return ['board', boardId, 'invites'];
}

/** Membership changes ripple into the member list, invites, the board's own role/count, and the dashboard. */
function invalidateMembership(qc: QueryClient, boardId: string): void {
  void qc.invalidateQueries({ queryKey: membersQueryKey(boardId) });
  void qc.invalidateQueries({ queryKey: invitesQueryKey(boardId) });
  void qc.invalidateQueries({ queryKey: ['board', boardId] });
  void qc.invalidateQueries({ queryKey: ['boards'] });
}

export function useMembers(boardId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: membersQueryKey(boardId),
    queryFn: ({ pageParam }) => membersApi.listMembers(boardId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursorOf<BoardMember>,
    enabled,
  });
}

export function useInvites(boardId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: invitesQueryKey(boardId),
    queryFn: ({ pageParam }) => listInvites(boardId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursorOf<BoardInviteSummary>,
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

export function useAddMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation<BoardMember, Error, AddMemberRequest>({
    mutationFn: (body) => membersApi.addMember(boardId, body),
    onSuccess: () => invalidateMembership(qc, boardId),
  });
}

/**
 * Hand the board to another member. The caller drops to editor, so the fresh board
 * (with the new role) is written straight into the cache before anything refetches.
 */
export function useTransferOwnership(boardId: string) {
  const qc = useQueryClient();
  return useMutation<Board, Error, string>({
    mutationFn: (userId) => membersApi.transferOwnership(boardId, userId),
    onSuccess: (board) => {
      qc.setQueryData(['board', boardId], board);
      invalidateMembership(qc, boardId);
    },
  });
}
