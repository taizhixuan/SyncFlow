import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth, useSessionProbe } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { acceptInvite, getInvitePreview } from '../api/invites-api';

/**
 * A preview that failed with a 4xx (other than 429) means the link itself is
 * bad. Anything else (offline, a 5xx, rate limiting) says nothing about the
 * invite, so it must not be reported as invalid.
 */
function isLinkProblem(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429
  );
}

function acceptErrorText(error: unknown, signedInAs: string | undefined): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return `This invite was sent to a different email address${
        signedInAs ? `, and you’re signed in as ${signedInAs}` : ''
      }. Sign in with the invited account to join.`;
    }
    if (error.status === 410)
      return 'This invite has already been used or has expired. Ask the owner for a new one.';
    if (error.status === 404)
      return 'This invite link is no longer valid. Ask the owner for a new one.';
  }
  return 'Couldn’t accept the invite. Please try again.';
}

function CenteredMessage({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-paper dark:bg-paper-dark px-4 text-center">
      {children}
    </div>
  );
}

const LINK_CLASS =
  'rounded-md px-3 py-2 text-sm text-brand hover:bg-sunken dark:hover:bg-sunken-dark';
const PRIMARY_CLASS =
  'w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60';

export function InviteAcceptPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { status: authStatus, user, retry } = useAuth();
  const queryClient = useQueryClient();
  const returnTo = encodeURIComponent(`/invite/${token ?? ''}`);

  const previewQuery = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => getInvitePreview(token!),
    // token is always present — route won't match without it
    enabled: Boolean(token),
  });

  // Signed-out can rest on this browser's hint alone, which is per web origin
  // and can be stale: ask the server once before offering "Log in" — and only
  // when there is something to log in for, so a dead link costs no request.
  const probe = useSessionProbe();
  const actionable = previewQuery.data?.valid === true || previewQuery.data?.used === true;
  const mustConfirm = authStatus === 'anonymous' && probe.unconfirmed && actionable;
  const { confirm } = probe;
  useEffect(() => {
    if (mustConfirm) confirm();
  }, [mustConfirm, confirm]);
  const status = mustConfirm ? 'loading' : authStatus;

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token!),
    onSuccess: (data) => {
      // The dashboard's board list now includes this board.
      void queryClient.invalidateQueries({ queryKey: ['boards'] });
      void navigate(`/app/board/${data.boardId}`);
    },
  });

  const acceptError = acceptMutation.isError && (
    <p role="alert" className="text-center text-xs text-danger">
      {acceptErrorText(acceptMutation.error, user?.email)}
    </p>
  );

  // Loading state
  if (previewQuery.isLoading || previewQuery.isPending) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-paper dark:bg-paper-dark">
        <p className="text-sm text-ink-400 dark:text-ink-dark">Loading invite…</p>
      </div>
    );
  }

  // Couldn't reach the server: the invite may be perfectly fine, so offer a retry.
  if (previewQuery.isError && !isLinkProblem(previewQuery.error)) {
    return (
      <CenteredMessage>
        <div role="alert" className="space-y-2">
          <p className="text-sm font-medium text-ink dark:text-ink-dark">
            Couldn’t load this invite.
          </p>
          <p className="text-sm text-ink-600 dark:text-ink-dark">
            Check your connection and try again.
          </p>
        </div>
        <button
          onClick={() => void previewQuery.refetch()}
          disabled={previewQuery.isFetching}
          className={`${LINK_CLASS} font-medium disabled:opacity-60`}
        >
          {previewQuery.isFetching ? 'Retrying…' : 'Retry'}
        </button>
      </CenteredMessage>
    );
  }

  // A used single-use invite can't add anyone new, but accepting it still
  // routes someone who already joined (typically the invitee) to the board.
  if (previewQuery.data?.used) {
    return (
      <CenteredMessage>
        <p className="text-sm font-medium text-ink dark:text-ink-dark">
          This invite has already been used.
        </p>
        <p className="max-w-sm text-sm text-ink-600 dark:text-ink-dark">
          If you joined with it, you can open the board. Otherwise ask the owner for a new invite.
        </p>
        <div className="w-full max-w-xs space-y-3">
          {status === 'authenticated' && (
            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              className={PRIMARY_CLASS}
            >
              {acceptMutation.isPending ? 'Opening…' : 'Open board'}
            </button>
          )}
          {status === 'anonymous' && (
            <Link
              to={`/login?returnTo=${returnTo}`}
              className={`block ${PRIMARY_CLASS} text-center`}
            >
              Log in to open it
            </Link>
          )}
          {acceptError}
        </div>
        <Link to="/" className={LINK_CLASS}>
          Go to home
        </Link>
      </CenteredMessage>
    );
  }

  if (previewQuery.isError || !previewQuery.data?.valid) {
    return (
      <CenteredMessage>
        <p className="text-sm font-medium text-danger">
          {previewQuery.data?.expired
            ? 'This invite has expired. Ask the owner for a new one.'
            : 'This invite link is invalid or has expired.'}
        </p>
        <Link to="/" className={LINK_CLASS}>
          Go to home
        </Link>
      </CenteredMessage>
    );
  }

  const preview = previewQuery.data;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-paper px-4 dark:bg-paper-dark">
      <div className="w-full max-w-sm rounded-xl border border-line bg-raised p-6 shadow-lg dark:border-line-dark dark:bg-raised-dark">
        <h1 className="font-display text-lg font-semibold text-ink dark:text-ink-dark">
          You've been invited
        </h1>

        {preview.inviterName && (
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-dark">
            <span className="font-medium">{preview.inviterName}</span> invited you to join
          </p>
        )}

        {preview.boardTitle && (
          <p className="mt-2 text-base font-semibold text-ink dark:text-ink-dark truncate">
            {preview.boardTitle}
          </p>
        )}

        {preview.role && (
          <p className="mt-1 text-xs text-ink-400 dark:text-ink-dark">
            You'll join as{' '}
            <span className="font-medium text-ink-600 dark:text-ink-dark">{preview.role}</span>
          </p>
        )}

        <div className="mt-6">
          {status === 'loading' && (
            <p className="text-center text-sm text-ink-400 dark:text-ink-dark">Checking your session…</p>
          )}

          {status === 'error' && (
            <div role="alert" className="space-y-2 text-center">
              <p className="text-sm text-ink-600 dark:text-ink-dark">
                Couldn&apos;t reach SyncFlow to check your session.
              </p>
              <button
                onClick={retry}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-brand hover:bg-sunken dark:hover:bg-sunken-dark"
              >
                Try again
              </button>
            </div>
          )}

          {status === 'authenticated' && (
            <div className="space-y-3">
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className={PRIMARY_CLASS}
              >
                {acceptMutation.isPending ? 'Joining…' : 'Accept invite'}
              </button>
              {acceptError}
            </div>
          )}

          {status === 'anonymous' && (
            <div className="space-y-3">
              <Link
                to={`/login?returnTo=${returnTo}`}
                className="block w-full rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-on-accent hover:brightness-105"
              >
                Log in to join
              </Link>
              <Link
                to={`/signup?returnTo=${returnTo}`}
                className="block w-full rounded-md border border-line px-4 py-2 text-center text-sm font-medium text-ink-600 hover:bg-sunken dark:border-line-dark dark:text-ink-dark dark:hover:bg-sunken-dark"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
