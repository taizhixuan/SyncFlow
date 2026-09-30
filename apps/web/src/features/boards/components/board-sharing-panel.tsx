import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { BoardMember } from '@syncflow/shared';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { createInvite, listInvites } from '../api/invites-api';
import { BoardMembersSection } from './board-members-section';
import { InviteRow } from './invite-row';


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
  useDialogFocus(panelRef, { onClose, active: open });

  // Share-link section state
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('viewer');
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  // Which button started the last link creation, so its failure shows in one place only.
  const [linkSource, setLinkSource] = useState<'section' | 'notice'>('section');

  // Set after a removal: the server revoked every share link, so tell the owner why.
  const [removedName, setRemovedName] = useState<string | null>(null);

  // Email invite section state
  const [emailRole, setEmailRole] = useState<'editor' | 'viewer'>('viewer');
  const [emailInput, setEmailInput] = useState('');
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const invitesQuery = useQuery({
    queryKey: ['board', boardId, 'invites'],
    queryFn: () => listInvites(boardId),
    enabled: open,
  });

  const createLinkMutation = useMutation({
    mutationFn: () =>
      createInvite(boardId, { kind: 'share_link', role: linkRole }),
    onSuccess: (data) => {
      setLinkResult(data.inviteUrl);
      void queryClient.invalidateQueries({ queryKey: ['board', boardId, 'invites'] });
    },
  });

  const createEmailMutation = useMutation({
    mutationFn: () =>
      createInvite(boardId, { kind: 'email', role: emailRole, email: emailInput.trim() }),
    onSuccess: (data) => {
      setEmailResult(data.inviteUrl);
      setEmailInput('');
      void queryClient.invalidateQueries({ queryKey: ['board', boardId, 'invites'] });
    },
  });


  function handleMemberRemoved(member: BoardMember): void {
    // Any link shown so far was just revoked server-side; don't let the owner copy a dead link.
    setLinkResult(null);
    setLinkCopied(false);
    createLinkMutation.reset();
    setRemovedName(member.displayName);
  }

  function handleCopyLink(): void {
    if (!linkResult) return;
    void navigator.clipboard.writeText(linkResult).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function handleCopyEmail(): void {
    if (!emailResult) return;
    void navigator.clipboard.writeText(emailResult).then(() => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    });
  }

  if (!open) return null;

  // Portal out: a fixed panel is trapped by any ancestor with transform/filter/backdrop-filter.
  return createPortal(
    <aside
      ref={panelRef}
      className="fixed right-0 top-0 z-30 flex h-full w-full flex-col sm:w-96 border-l border-line bg-raised shadow-xl dark:border-line-dark dark:bg-raised-dark"
      role="dialog"
      aria-label="Board sharing"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line-dark">
        <h2 className="font-display text-sm font-semibold text-ink dark:text-ink-dark">
          Share board
        </h2>
        <button
          onClick={onClose}
          aria-label="Close sharing panel"
          className="rounded-md p-1.5 text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

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
              className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1">
                  Share links were reset so {removedName} can&apos;t rejoin. Create a new link to
                  invite others.
                </p>
                <button
                  onClick={() => setRemovedName(null)}
                  aria-label="Dismiss notice"
                  className="shrink-0 rounded-md p-0.5 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-amber-900/50"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              {linkResult ? (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 dark:border-line-dark dark:bg-raised-dark">
                  <span className="flex-1 truncate font-mono text-xs text-ink-600 dark:text-ink-dark">
                    {linkResult}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-brand hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-sunken-dark"
                  >
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
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
            enabled={open}
            onMemberRemoved={handleMemberRemoved}
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
            <div className="mt-3 flex items-center gap-2 rounded-md border border-line bg-sunken px-3 py-2 dark:border-line-dark dark:bg-sunken-dark">
              <span className="flex-1 truncate font-mono text-xs text-ink-600 dark:text-ink-dark">
                {linkResult}
              </span>
              <button
                onClick={handleCopyLink}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-brand hover:bg-raised dark:hover:bg-raised-dark"
              >
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
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
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate font-mono text-xs text-ink-400 dark:text-ink-dark">
                  {emailResult}
                </span>
                <button
                  onClick={handleCopyEmail}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-brand hover:bg-raised dark:hover:bg-raised-dark"
                >
                  {emailCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
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

          {invitesQuery.isError && (
            <div className="py-6 text-center">
              <p className="text-sm text-rose-600 dark:text-rose-400">
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

          {invitesQuery.isSuccess && invitesQuery.data.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-400 dark:text-ink-dark">
              No active invites.
            </p>
          )}

          {invitesQuery.isSuccess && invitesQuery.data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {invitesQuery.data.map((invite) => (
                <InviteRow key={invite.id} boardId={boardId} invite={invite} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>,
    document.body,
  );
}
