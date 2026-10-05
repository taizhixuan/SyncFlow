import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, X } from 'lucide-react';
import type { BoardMember } from '@syncflow/shared';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { createInvite } from '../api/invites-api';
import { flattenPages, useBoard } from '../hooks/use-boards';
import { invitesQueryKey, useInvites } from '../hooks/use-members';
import { BoardMembersSection } from './board-members-section';
import { CopyLinkField } from './copy-link-field';
import { InviteRow } from './invite-row';
import { LoadMoreButton } from './load-more-button';

interface CreatedLink {
  id: string;
  url: string;
}

export function BoardSharingPanel({
  boardId,
  open,
  onClose,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLElement>(null);
  const board = useBoard(boardId);
  // Set once this owner hands the board over; they're an editor from then on.
  const [transferredTo, setTransferredTo] = useState<string | null>(null);
  const role = board.data?.role;
  // Only the owner can open this panel, so an unknown role (still loading) counts as owner.
  const isOwner = transferredTo === null && (role === undefined || role === 'owner');
  // Owner-only queries stop the moment the caller stops owning the board (they'd 403).
  const active = open && isOwner;

  function handleClose(): void {
    setTransferredTo(null);
    onClose();
  }

  useDialogFocus(panelRef, { onClose: handleClose, active: open });

  // Share-link section state
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('viewer');
  // Kept with its invite id so revoking that invite below can take the link away.
  const [linkResult, setLinkResult] = useState<CreatedLink | null>(null);
  // Which button started the last link creation, so its failure shows in one place only.
  const [linkSource, setLinkSource] = useState<'section' | 'notice'>('section');

  // Set after a removal: the server revoked every share link, so tell the owner why.
  const [removedName, setRemovedName] = useState<string | null>(null);

  // Email invite section state
  const [emailRole, setEmailRole] = useState<'editor' | 'viewer'>('viewer');
  const [emailInput, setEmailInput] = useState('');
  const [emailResult, setEmailResult] = useState<CreatedLink | null>(null);

  const invitesQuery = useInvites(boardId, active);
  const invites = flattenPages(invitesQuery.data);

  const createLinkMutation = useMutation({
    mutationFn: () =>
      createInvite(boardId, { kind: 'share_link', role: linkRole }),
    onSuccess: (data) => {
      setLinkResult({ id: data.id, url: data.inviteUrl });
      void queryClient.invalidateQueries({ queryKey: invitesQueryKey(boardId) });
    },
  });

  const createEmailMutation = useMutation({
    mutationFn: () =>
      createInvite(boardId, { kind: 'email', role: emailRole, email: emailInput.trim() }),
    onSuccess: (data) => {
      setEmailResult({ id: data.id, url: data.inviteUrl });
      setEmailInput('');
      void queryClient.invalidateQueries({ queryKey: invitesQueryKey(boardId) });
    },
  });

  // A link from an earlier visit may have been revoked since; reopening starts clean.
  const resetLinkMutation = createLinkMutation.reset;
  const resetEmailMutation = createEmailMutation.reset;
  useEffect(() => {
    if (open) return;
    setLinkResult(null);
    setEmailResult(null);
    resetLinkMutation();
    resetEmailMutation();
  }, [open, resetLinkMutation, resetEmailMutation]);

  function handleMemberRemoved(member: BoardMember): void {
    // Any link shown so far was just revoked server-side; don't let the owner copy a dead link.
    setLinkResult(null);
    createLinkMutation.reset();
    setRemovedName(member.displayName);
  }

  function handleInviteRevoked(inviteId: string): void {
    // A revoked invite's link no longer works, so stop offering it for copying.
    setLinkResult((current) => (current?.id === inviteId ? null : current));
    setEmailResult((current) => (current?.id === inviteId ? null : current));
  }

  if (!open) return null;

  // Portal out: a fixed panel is trapped by any ancestor with transform/filter/backdrop-filter.
  return createPortal(
    <aside
      ref={panelRef}
      className="fixed bottom-0 right-0 top-0 z-30 flex md:bottom-8 md:top-[52px] w-full flex-col sm:w-96 border-l border-line bg-chrome shadow-float md:shadow-none"
      role="dialog"
      aria-label="Board sharing"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line-dark">
        <h2 className="font-display text-sm font-semibold text-ink dark:text-ink-dark">
          Share board
        </h2>
        <button
          onClick={handleClose}
          aria-label="Close sharing panel"
          className="rounded-md p-1.5 text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {!isOwner && (
        <div className="px-4 py-6">
          <div
            role="status"
            aria-label="Ownership notice"
            className="rounded-md border border-line bg-sunken px-3 py-3 text-sm text-ink-600 dark:border-line-dark dark:bg-sunken-dark dark:text-ink-dark"
          >
            <p className="flex items-start gap-2">
              <Crown
                size={16}
                className="mt-0.5 shrink-0 text-ink"
                aria-hidden="true"
              />
              <span>
                {transferredTo
                  ? `${transferredTo} is now the owner. You’re now an editor, so sharing and member management are theirs from here.`
                  : 'Only the board owner can manage sharing. Ask them to invite people or change roles.'}
              </span>
            </p>
            <div className="mt-3 flex justify-end">
              <Button onClick={handleClose}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Members section */}
          <section aria-labelledby="members-heading">
            <h3
              id="members-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-dark"
            >
              Members
            </h3>
            {removedName && (
              <div
                role="status"
                aria-label="Members notice"
                className="mb-3 rounded-md border border-warn/50 bg-warn/15 px-3 py-2 text-xs text-ink"
              >
                <div className="flex items-start gap-2">
                  <p className="flex-1">
                    Share links were reset so {removedName} can&apos;t rejoin. Create a new link to
                    invite others.
                  </p>
                  <button
                    onClick={() => setRemovedName(null)}
                    aria-label="Dismiss notice"
                    className="shrink-0 rounded-md p-0.5 hover:bg-warn/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                {linkResult ? (
                  <CopyLinkField
                    url={linkResult.url}
                    label="New share link"
                    className="mt-2 rounded-md border border-line bg-raised px-2 py-1 dark:border-line-dark dark:bg-raised-dark"
                    buttonClassName="hover:bg-sunken dark:hover:bg-sunken-dark"
                  />
                ) : (
                  <Button
                    onClick={() => {
                      setLinkSource('notice');
                      createLinkMutation.mutate();
                    }}
                    disabled={createLinkMutation.isPending}
                    className="mt-2 w-full"
                  >
                    {createLinkMutation.isPending
                      ? 'Creating…'
                      : `Create new share link (${linkRole})`}
                  </Button>
                )}
                {createLinkMutation.isError && linkSource === 'notice' && (
                  <p role="alert" className="mt-2 text-danger">
                    Failed to create link. Please try again.
                  </p>
                )}
              </div>
            )}
            <BoardMembersSection
              boardId={boardId}
              enabled={active}
              onMemberRemoved={handleMemberRemoved}
              onOwnershipTransferred={(member) => setTransferredTo(member.displayName)}
            />
          </section>

          {/* Share link section */}
          <section aria-labelledby="share-link-heading">
            <h3
              id="share-link-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-dark"
            >
              Share link
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <label htmlFor="link-role" className="text-xs text-ink-600 dark:text-ink-dark shrink-0">
                Role
              </label>
              <select
                id="link-role"
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value as 'editor' | 'viewer')}
                className="flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <Button
              onClick={() => {
                setLinkSource('section');
                createLinkMutation.mutate();
              }}
              disabled={createLinkMutation.isPending}
              className="w-full"
            >
              {createLinkMutation.isPending ? 'Creating…' : 'Create share link'}
            </Button>
            {createLinkMutation.isError && linkSource === 'section' && (
              <p role="alert" className="mt-2 text-xs text-danger">
                Failed to create link. Please try again.
              </p>
            )}
            {linkResult && (
              <CopyLinkField
                url={linkResult.url}
                label="Share link"
                className="mt-3 rounded-md border border-line bg-sunken px-3 py-2 dark:border-line-dark dark:bg-sunken-dark"
                buttonClassName="hover:bg-raised dark:hover:bg-raised-dark"
              />
            )}
          </section>

          {/* Email invite section */}
          <section aria-labelledby="email-invite-heading">
            <h3
              id="email-invite-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-dark"
            >
              Email invite
            </h3>
            <div className="space-y-2">
              <TextField
                label="Email address"
                name="invite-email"
                type="email"
                autoComplete="off"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label htmlFor="email-role" className="text-xs text-ink-600 dark:text-ink-dark shrink-0">
                  Role
                </label>
                <select
                  id="email-role"
                  value={emailRole}
                  onChange={(e) => setEmailRole(e.target.value as 'editor' | 'viewer')}
                  className="flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </div>
              <Button
                onClick={() => createEmailMutation.mutate()}
                disabled={createEmailMutation.isPending || !emailInput.trim()}
                className="w-full"
              >
                {createEmailMutation.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
            {createEmailMutation.isError && (
              <p role="alert" className="mt-2 text-xs text-danger">
                Failed to send invite. Please try again.
              </p>
            )}
            {emailResult && (
              <div className="mt-3 rounded-md border border-line bg-sunken px-3 py-2 dark:border-line-dark dark:bg-sunken-dark">
                <p className="text-xs text-ink-600 dark:text-ink-dark mb-1">Invite link generated:</p>
                <CopyLinkField
                  url={emailResult.url}
                  label="Email invite link"
                  buttonClassName="hover:bg-raised dark:hover:bg-raised-dark"
                />
              </div>
            )}
          </section>

          {/* Active invites list */}
          <section aria-labelledby="active-invites-heading">
            <h3
              id="active-invites-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-dark"
            >
              Active invites
            </h3>

            {invitesQuery.isLoading && (
              <p className="py-6 text-center text-sm text-ink-400 dark:text-ink-dark">
                Loading invites…
              </p>
            )}

            {invitesQuery.isError && !invitesQuery.data && (
              <div className="py-6 text-center">
                <p className="text-sm text-danger">
                  Couldn't load invites.
                </p>
                <button
                  onClick={() => void invitesQuery.refetch()}
                  className="mt-2 rounded-md px-2 py-1 text-sm text-brand hover:bg-sunken dark:hover:bg-sunken-dark"
                >
                  Retry
                </button>
              </div>
            )}

            {invitesQuery.data && invites.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-400 dark:text-ink-dark">
                No active invites.
              </p>
            )}

            {invites.length > 0 && (
              <ul aria-label="Active invites" className="flex flex-col gap-2">
                {invites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    boardId={boardId}
                    invite={invite}
                    onRevoked={handleInviteRevoked}
                  />
                ))}
              </ul>
            )}
            <LoadMoreButton
              query={invitesQuery}
              label="Show more invites"
              errorText="Couldn’t load more invites. Please try again."
              className="mt-2"
            />
          </section>
        </div>
      )}
    </aside>,
    document.body,
  );
}
