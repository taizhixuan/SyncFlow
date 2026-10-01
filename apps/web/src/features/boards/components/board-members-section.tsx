import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Crown, Loader2, UserMinus, UserPlus } from 'lucide-react';
import { addMemberRequestSchema } from '@syncflow/shared';
import type { BoardMember } from '@syncflow/shared';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import type { AssignableRole } from '../api/members-api';
import { flattenPages } from '../hooks/use-boards';
import {
  useAddMember,
  useMembers,
  useRemoveMember,
  useTransferOwnership,
  useUpdateMemberRole,
} from '../hooks/use-members';
import { LoadMoreButton } from './load-more-button';

const SELECT_CLASS =
  'rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark';

const ICON_BUTTON =
  'rounded-md border border-line p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark';

const CONFIRM_CANCEL =
  'rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 dark:text-ink-dark dark:hover:bg-sunken-dark';

type Confirm = 'remove' | 'transfer';

function MemberRow({
  boardId,
  member,
  isYou,
  onRemoved,
  onTransferred,
}: {
  boardId: string;
  member: BoardMember;
  isYou: boolean;
  onRemoved: (member: BoardMember) => void;
  onTransferred: (member: BoardMember) => void;
}): JSX.Element {
  // Mutations live per row so one row's pending/error state never bleeds into another's.
  const updateRole = useUpdateMemberRole(boardId);
  const remove = useRemoveMember(boardId);
  const transfer = useTransferOwnership(boardId);
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const transferRef = useRef<HTMLButtonElement>(null);
  const lastConfirm = useRef<Confirm | null>(null);

  // Focus moves into the confirm when it opens and back to whichever control opened it.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (lastConfirm.current === 'remove') removeRef.current?.focus();
    else if (lastConfirm.current === 'transfer') transferRef.current?.focus();
    lastConfirm.current = confirming;
  }, [confirming]);

  const isOwner = member.role === 'owner';
  const confirmPending = remove.isPending || transfer.isPending;
  const busy = updateRole.isPending || confirmPending;
  const shownRole = updateRole.isPending ? updateRole.variables.role : member.role;
  const name = member.displayName;

  function openConfirm(kind: Confirm): void {
    remove.reset();
    transfer.reset();
    setConfirming(kind);
  }

  function runConfirm(): void {
    if (confirming === 'remove') {
      remove.mutate(member.userId, {
        onSuccess: () => {
          setConfirming(null);
          onRemoved(member);
        },
      });
    } else {
      transfer.mutate(member.userId, { onSuccess: () => onTransferred(member) });
    }
  }

  const copy =
    confirming === 'transfer'
      ? {
          text: `Make ${name} the owner? You’ll become an editor and lose owner-only controls like sharing, member management and deleting the board.`,
          action: 'Make owner',
          busy: 'Transferring…',
          label: `Confirm make ${name} owner`,
          tone: 'bg-warn/15',
          button: 'bg-accent text-on-accent',
        }
      : {
          text: `Remove ${name} from this board? They lose access right away, and all share links are reset.`,
          action: 'Remove',
          busy: 'Removing…',
          label: `Confirm remove ${name}`,
          tone: 'bg-danger/10',
          button: 'bg-danger text-white',
        };

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
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">
            <Crown size={12} aria-hidden="true" />
            Owner
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              aria-label={`Role for ${name}`}
              value={shownRole}
              disabled={busy || confirming !== null}
              onChange={(e) =>
                updateRole.mutate({ userId: member.userId, role: e.target.value as AssignableRole })
              }
              className={SELECT_CLASS}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            {confirming === null && (
              <>
                <button
                  ref={transferRef}
                  onClick={() => openConfirm('transfer')}
                  disabled={busy}
                  aria-label={`Make ${name} owner`}
                  title="Make owner"
                  className={`${ICON_BUTTON} text-ink hover:bg-warn/15`}
                >
                  <Crown size={14} aria-hidden="true" />
                </button>
                <button
                  ref={removeRef}
                  onClick={() => openConfirm('remove')}
                  disabled={busy}
                  aria-label={`Remove ${name}`}
                  title="Remove member"
                  className={`${ICON_BUTTON} text-danger hover:bg-danger/10`}
                >
                  <UserMinus size={14} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isOwner && isYou && (
        <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-dark">
          You own this board. Make someone else the owner before you can leave it.
        </p>
      )}

      {updateRole.isPending && (
        <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-dark" aria-live="polite">
          Saving role…
        </p>
      )}

      {confirming && (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !confirmPending) {
              // Close just the confirm, not the whole panel.
              e.stopPropagation();
              setConfirming(null);
            }
          }}
          className={`mt-2 rounded-md px-2 py-2 ${copy.tone}`}
        >
          <p className="text-xs text-ink-600 dark:text-ink-dark">{copy.text}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              ref={cancelRef}
              onClick={() => setConfirming(null)}
              disabled={confirmPending}
              className={CONFIRM_CANCEL}
            >
              Cancel
            </button>
            <button
              onClick={runConfirm}
              disabled={confirmPending}
              aria-label={copy.label}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${copy.button}`}
            >
              {confirmPending && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              {confirmPending ? copy.busy : copy.action}
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
      {transfer.isError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          Couldn&apos;t make {name} the owner. Please try again.
        </p>
      )}
    </li>
  );
}

function addMemberErrorText(error: Error): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'No SyncFlow account uses that email — send them an invite link instead';
  }
  if (error instanceof ApiError && error.status === 409) return 'Already a member of this board';
  return 'Couldn’t add that member. Please try again.';
}

/** Add an existing SyncFlow user straight onto the board by email. */
function AddMemberForm({ boardId }: { boardId: string }): JSX.Element {
  const add = useAddMember(boardId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('viewer');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const ids = useId();
  const emailId = `${ids}-email`;
  const roleId = `${ids}-role`;
  const errorId = `${ids}-error`;

  function submit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setAdded(null);
    add.reset();
    const parsed = addMemberRequestSchema.safeParse({ email, role });
    if (!parsed.success) {
      setFieldError('Enter a valid email address.');
      return;
    }
    setFieldError(null);
    add.mutate(parsed.data, {
      onSuccess: (member) => {
        setEmail('');
        setAdded(`Added ${member.displayName} as ${member.role}.`);
      },
    });
  }

  return (
    <form aria-label="Add a member" noValidate onSubmit={submit} className="mb-3 space-y-2">
      <label
        htmlFor={emailId}
        className="block text-xs font-medium text-ink-600 dark:text-ink-dark"
      >
        Member email
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={emailId}
          type="email"
          autoComplete="off"
          inputMode="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldError(null);
          }}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
          className="min-w-0 flex-1 basis-40 rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark"
        />
        <label htmlFor={roleId} className="sr-only">
          New member role
        </label>
        <select
          id={roleId}
          value={role}
          onChange={(e) => setRole(e.target.value as AssignableRole)}
          className={`${SELECT_CLASS} py-1.5`}
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          type="submit"
          disabled={add.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60"
        >
          {add.isPending ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus size={12} aria-hidden="true" />
          )}
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {fieldError && (
        <p id={errorId} className="text-xs text-danger">
          {fieldError}
        </p>
      )}
      {add.isError && (
        <p role="alert" className="text-xs text-danger">
          {addMemberErrorText(add.error)}
        </p>
      )}
      {added && (
        <p role="status" className="text-xs text-success">
          {added}
        </p>
      )}
    </form>
  );
}

/** Owner-only: add members by email, change roles, remove members, and hand over ownership. */
export function BoardMembersSection({
  boardId,
  enabled,
  onMemberRemoved,
  onOwnershipTransferred,
}: {
  boardId: string;
  enabled: boolean;
  onMemberRemoved: (member: BoardMember) => void;
  onOwnershipTransferred: (member: BoardMember) => void;
}): JSX.Element {
  const { user } = useAuth();
  const membersQuery = useMembers(boardId, enabled);
  const members = flattenPages(membersQuery.data);
  const hasData = membersQuery.data !== undefined;

  return (
    <>
      <AddMemberForm boardId={boardId} />

      {membersQuery.isLoading && (
        <p className="py-6 text-center text-sm text-ink-400 dark:text-ink-dark">Loading members…</p>
      )}

      {membersQuery.isError && !hasData && (
        <div className="py-6 text-center">
          <p className="text-sm text-danger">Couldn&apos;t load members.</p>
          <button
            onClick={() => void membersQuery.refetch()}
            aria-label="Retry loading members"
            className="mt-2 rounded-md px-2 py-1 text-sm text-brand hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-sunken-dark"
          >
            Retry
          </button>
        </div>
      )}

      {hasData && (
        <>
          <ul aria-label="Board members" className="flex flex-col gap-2">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                boardId={boardId}
                member={member}
                isYou={member.userId === user?.id}
                onRemoved={onMemberRemoved}
                onTransferred={onOwnershipTransferred}
              />
            ))}
          </ul>
          {!membersQuery.hasNextPage && members.every((m) => m.role === 'owner') && (
            <p className="mt-2 text-center text-xs text-ink-400 dark:text-ink-dark">
              No one else has joined yet. Add someone by email, share a link, or send an invite.
            </p>
          )}
          <LoadMoreButton
            query={membersQuery}
            label="Show more members"
            errorText="Couldn’t load more members. Please try again."
            className="mt-2"
          />
        </>
      )}
    </>
  );
}
