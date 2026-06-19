import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { acceptInvite, getInvitePreview } from '../api/invites-api';

export function InviteAcceptPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { status } = useAuth();

  const previewQuery = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => getInvitePreview(token!),
    // token is always present — route won't match without it
    enabled: Boolean(token),
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token!),
    onSuccess: (data) => {
      void navigate(`/app/board/${data.boardId}`);
    },
  });

  // Loading state
  if (previewQuery.isLoading || previewQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper dark:bg-paper-dark">
        <p className="text-sm text-ink-400 dark:text-ink-dark">Loading invite…</p>
      </div>
    );
  }

  // Error or invalid/expired invite
  if (
    previewQuery.isError ||
    !previewQuery.data?.valid ||
    previewQuery.data?.expired
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper dark:bg-paper-dark px-4">
        <p className="text-sm font-medium text-danger">
          This invite link is invalid or has expired.
        </p>
        <Link
          to="/"
          className="rounded-md px-3 py-2 text-sm text-brand hover:bg-sunken dark:hover:bg-sunken-dark"
        >
          Go to home
        </Link>
      </div>
    );
  }

  const preview = previewQuery.data;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-4 dark:bg-paper-dark">
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
            <p className="text-center text-sm text-ink-400 dark:text-ink-dark">Loading…</p>
          )}

          {status === 'authenticated' && (
            <div className="space-y-3">
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {acceptMutation.isPending ? 'Joining…' : 'Accept invite'}
              </button>
              {acceptMutation.isError && (
                <p role="alert" className="text-center text-xs text-danger">
                  Failed to accept invite. Please try again.
                </p>
              )}
            </div>
          )}

          {status === 'anonymous' && (
            <div className="space-y-3">
              <Link
                to={`/login?returnTo=/invite/${token}`}
                className="block w-full rounded-md bg-brand px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand/90"
              >
                Log in to join
              </Link>
              <Link
                to={`/signup?returnTo=/invite/${token}`}
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
