import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardRole } from '@syncflow/shared';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { createInvite, listInvites, revokeInvite } from '../api/invites-api';

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
  owner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  editor: 'bg-brand/10 text-brand dark:bg-brand/20',
  viewer: 'bg-sunken text-ink-400 dark:bg-sunken-dark dark:text-ink-dark',
};

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

  // Share-link section state
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('viewer');
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revokeInvite(boardId, inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', boardId, 'invites'] });
    },
  });

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

  return (
    <aside
      className="fixed right-0 top-0 z-30 flex h-full w-96 flex-col border-l border-line bg-raised shadow-xl dark:border-line-dark dark:bg-raised-dark"
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
          className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
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
            onClick={() => createLinkMutation.mutate()}
            disabled={createLinkMutation.isPending}
            className="w-full"
          >
            {createLinkMutation.isPending ? 'Creating…' : 'Create share link'}
          </Button>
          {createLinkMutation.isError && (
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
                <li
                  key={invite.id}
                  className="rounded-md border border-line px-3 py-2 dark:border-line-dark"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-600 dark:bg-sunken-dark dark:text-ink-dark">
                          {invite.kind === 'share_link' ? 'Link' : 'Email'}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${ROLE_BADGE[invite.role]}`}>
                          {invite.role}
                        </span>
                        {invite.acceptedAt && (
                          <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] dark:bg-emerald-900/40 dark:text-emerald-300">
                            Accepted
                          </span>
                        )}
                      </div>
                      {invite.email && (
                        <p className="mt-1 truncate text-xs text-ink-600 dark:text-ink-dark">
                          {invite.email}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-dark">
                        {expiryLabel(invite.expiresAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeMutation.mutate(invite.id)}
                      disabled={revokeMutation.isPending}
                      aria-label={`Revoke invite${invite.email ? ` for ${invite.email}` : ''}`}
                      className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-danger hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:hover:bg-rose-900/20"
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {revokeMutation.isError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              Failed to revoke invite. Please try again.
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}
