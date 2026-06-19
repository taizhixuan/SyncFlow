import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';

/** Gates routes that require authentication; redirects anonymous users to /login. */
export function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-paper">
        <span className="font-mono text-sm text-ink-400">Loading…</span>
      </div>
    );
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
