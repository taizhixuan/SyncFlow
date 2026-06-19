import { Link } from 'react-router-dom';
import { Brand } from '@/components/brand';
import { useAuth } from '@/features/auth/auth-context';

export function DashboardPage(): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-raised px-6 py-3">
        <Brand />
        <div className="flex items-center gap-3">
          {user && (
            <span
              title={user.displayName}
              className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: user.color }}
            >
              {user.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <button
            onClick={() => void logout()}
            className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-2xl font-bold text-ink">
          {user ? `Welcome, ${user.displayName}.` : 'Your boards'}
        </h1>
        <p className="mt-1 text-ink-600">Open a board to start drawing together.</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Link
            to="/app/board/local"
            className="group flex h-40 flex-col justify-between rounded-lg border border-line bg-raised p-4 shadow-raised transition hover:border-brand"
          >
            <div className="h-16 rounded-md bg-dot-grid bg-dots" />
            <div>
              <p className="font-display text-sm font-semibold text-ink">Local board</p>
              <p className="font-mono text-xs text-ink-400">scratchpad · on this device</p>
            </div>
          </Link>

          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-ink-400">
            <span className="text-sm">More boards coming soon</span>
          </div>
        </div>

        <p className="mt-8 font-mono text-xs text-ink-400">
          Phase 4 · canvas online. Persisted &amp; shared boards arrive with the boards API.
        </p>
      </main>
    </div>
  );
}
