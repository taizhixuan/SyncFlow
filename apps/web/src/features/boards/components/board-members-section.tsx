import { useEffect, useRef, useState } from 'react';
import { Crown, UserMinus } from 'lucide-react';
import type { BoardMember } from '@syncflow/shared';
import { useAuth } from '@/features/auth/auth-context';
import type { AssignableRole } from '../api/members-api';
import { useMembers, useRemoveMember, useUpdateMemberRole } from '../hooks/use-members';

const SELECT_CLASS =
  'rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark';

function MemberRow({
  boardId,
  member,
  isYou,
  onRemoved,
}: {
  boardId: string;
  member: BoardMember;
  isYou: boolean;
  onRemoved: (member: BoardMember) => void;
}): JSX.Element {
  // Mutations live per row so one row's pending/error state never bleeds into another's.
  const updateRole = useUpdateMemberRole(boardId);
  const remove = useRemoveMember(boardId);
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) removeRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const isOwner = member.role === 'owner';
  const busy = updateRole.isPending || remove.isPending;
  const shownRole = updateRole.isPending ? updateRole.variables.role : member.role;
  const name = member.displayName;

  function confirmRemove(): void {
    remove.mutate(member.userId, {
      onSuccess: () => {
        setConfirming(false);
        onRemoved(member);
      },
    });
  }

  return (
    <li className="rounded-md border border-line px-3 py-2 dark:border-line-dark">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink dark:text-ink-dark">{name}</span>
            {isYou && (
              <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-600 dark:bg-sunken-dark dark:text-ink-dark">
                You
              </span>
            )}
          </div>
          <p className="truncate text-xs text-ink-400 dark:text-ink-dark">{member.email}</p>
        </div>

        {isOwner ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Crown size={12} aria-hidden="true" />
            Owner
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              aria-label={`Role for ${name}`}
              value={shownRole}
              disabled={busy || confirming}
              onChange={(e) =>
                updateRole.mutate({ userId: member.userId, role: e.target.value as AssignableRole })
              }
              className={SELECT_CLASS}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            {!confirming && (
              <button
                ref={removeRef}
                onClick={() => {
                  remove.reset();
                  setConfirming(true);
                }}
                disabled={busy}
                aria-label={`Remove ${name}`}
                className="rounded-md border border-line p-1.5 text-danger hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:hover:bg-rose-900/20"
              >
                <UserMinus size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {updateRole.isPending && (
        <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-dark" aria-live="polite">
          Saving role…
        </p>
      )}

      {confirming && (
        <div className="mt-2 rounded-md bg-rose-50 px-2 py-2 dark:bg-rose-900/20">
          <p className="text-xs text-ink-600 dark:text-ink-dark">
            Remove {name} from this board? They lose access right away, and all share links are
            reset.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              ref={cancelRef}
              onClick={() => setConfirming(false)}
              disabled={remove.isPending}
              className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 dark:text-ink-dark dark:hover:bg-sunken-dark"
            >
              Cancel
            </button>
            <button
              onClick={confirmRemove}
              disabled={remove.isPending}
              aria-label={`Confirm remove ${name}`}
              className="rounded-md bg-danger px-2 py-1 text-xs font-medium text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}

      {updateRole.isError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          Couldn&apos;t change role for {name}. Please try again.
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          Couldn&apos;t remove {name}. Please try again.
        </p>
      )}
    </li>
  );
}

/** Owner-only list of the board's members with role changes and removal. */
export function BoardMembersSection({
  boardId,
  enabled,
  onMemberRemoved,
}: {
  boardId: string;
  enabled: boolean;
  onMemberRemoved: (member: BoardMember) => void;
}): JSX.Element {
  const { user } = useAuth();
  const membersQuery = useMembers(boardId, enabled);

  return (
    <>
      {membersQuery.isLoading && (
        <p className="py-6 text-center text-sm text-ink-400 dark:text-ink-dark">Loading members…</p>
      )}

      {membersQuery.isError && (
        <div className="py-6 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-400">Couldn&apos;t load members.</p>
          <button
            onClick={() => void membersQuery.refetch()}
            aria-label="Retry loading members"
            className="mt-2 rounded-md px-2 py-1 text-sm text-brand hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-sunken-dark"
          >
            Retry
          </button>
        </div>
      )}

      {membersQuery.isSuccess && (
        <>
          <ul aria-label="Board members" className="flex flex-col gap-2">
            {membersQuery.data.map((member) => (
              <MemberRow
                key={member.userId}
                boardId={boardId}
                member={member}
                isYou={member.userId === user?.id}
                onRemoved={onMemberRemoved}
              />
            ))}
          </ul>
          {membersQuery.data.every((m) => m.role === 'owner') && (
            <p className="mt-2 text-center text-xs text-ink-400 dark:text-ink-dark">
              No one else has joined yet. Share a link or send an email invite.
            </p>
          )}
        </>
      )}
    </>
  );
}
