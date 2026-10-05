import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardInviteSummary, BoardRole } from '@syncflow/shared';
import { revokeInvite } from '../api/invites-api';
import { invitesQueryKey } from '../hooks/use-members';

/** Human-readable expiry label. */
function expiryLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = then - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `Expires in ${hours}h`;
  const days = Math.round(diff / 86_400_000);
  return `Expires in ${days}d`;
}

const ROLE_BADGE: Record<BoardRole, string> = {
  owner: 'bg-success/15 text-success',
  editor: 'bg-brand/10 text-brand dark:bg-brand/20',
  viewer: 'bg-sunken text-ink-400 dark:bg-sunken-dark dark:text-ink-dark',
};

/**
 * One active invite; owns its revoke mutation so pending/error state stays per
 * row. `onRevoked` lets the panel drop a freshly created link for this invite.
 */
export function InviteRow({
  boardId,
  invite,
  onRevoked,
}: {
  boardId: string;
  invite: BoardInviteSummary;
  onRevoked?: (inviteId: string) => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => revokeInvite(boardId, invite.id),
    onSuccess: () => {
      onRevoked?.(invite.id);
      void queryClient.invalidateQueries({ queryKey: invitesQueryKey(boardId) });
    },
  });

  return (
    <li className="rounded-md border border-line px-3 py-2 dark:border-line-dark">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-600 dark:bg-sunken-dark dark:text-ink-dark">
              {invite.kind === 'share_link' ? 'Link' : 'Email'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${ROLE_BADGE[invite.role]}`}>
              {invite.role}
            </span>
            {invite.acceptedAt && (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">
                Accepted
              </span>
            )}
          </div>
          {invite.email && (
            <p className="mt-1 truncate text-xs text-ink-600 dark:text-ink-dark">{invite.email}</p>
          )}
          <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-dark">
            {expiryLabel(invite.expiresAt)}
          </p>
        </div>
        <button
          onClick={() => revoke.mutate()}
          disabled={revoke.isPending}
          aria-label={`Revoke invite${invite.email ? ` for ${invite.email}` : ''}`}
          className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark"
        >
          {revoke.isPending ? 'Revoking…' : 'Revoke'}
        </button>
      </div>
      {revoke.isError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          Failed to revoke invite. Please try again.
        </p>
      )}
    </li>
  );
}
