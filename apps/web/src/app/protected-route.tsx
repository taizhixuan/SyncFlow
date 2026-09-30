import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/button';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Gates routes that require authentication. Anonymous users go to /login with a
 * `returnTo` so they land back where they were (e.g. an invited board).
 */
export function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div role="status" className="grid min-h-[100dvh] place-items-center bg-paper dark:bg-paper-dark">
        <span className="font-mono text-sm text-ink-400">Loading…</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-paper px-4 dark:bg-paper-dark">
        <div role="alert" className="max-w-sm text-center">
          <p className="font-medium text-ink dark:text-ink-dark">Couldn&apos;t reach SyncFlow.</p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
            The server may be waking up, or you may be offline.
          </p>
          <Button onClick={retry} className="mt-4">
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (status === 'anonymous') {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <>{children}</>;
}
