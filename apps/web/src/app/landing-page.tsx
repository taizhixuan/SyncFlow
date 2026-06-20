import { Link } from 'react-router-dom';
import { PRESENCE_PALETTE, type HealthStatus } from '@syncflow/shared';
import { Brand } from '@/components/brand';
import { CursorFlag } from '@/components/cursor-flag';
import { useApiHealth } from '@/hooks/use-api-health';
import { describeStatus, TONE_CLASS } from '@/lib/health-status';
import { useAuth } from '@/features/auth/auth-context';

export function LandingPage(): JSX.Element {
  const { status } = useAuth();

  return (
    <main className="min-h-screen bg-paper bg-dot-grid bg-dots">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Brand />
        <nav className="flex items-center gap-2">
          <a
            href="https://github.com/taizhixuan/SyncFlow"
            target="_blank"
            rel="noreferrer"
            aria-label="SyncFlow source on GitHub"
            title="View source on GitHub"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-sunken hover:text-ink"
          >
            <GitHubIcon className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          {status === 'authenticated' ? (
            <Link
              to="/app"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              Open app
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-md px-4 py-2 text-sm font-medium text-ink-600 hover:bg-sunken">
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-12 lg:grid-cols-2">
        <section>
          <h1 className="font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
            The whiteboard that
            <br />
            stays in sync.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-600">
            Real-time canvas. Live cursors. Conflict-free editing that just works, even offline.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              to={status === 'authenticated' ? '/app' : '/signup'}
              className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              {status === 'authenticated' ? 'Open app' : 'Start free'}
            </Link>
            <Link
              to="/app/board/local"
              className="rounded-md border border-line bg-raised px-5 py-2.5 text-sm font-medium text-ink hover:bg-sunken"
            >
              Try the canvas ▸
            </Link>
          </div>
          <PresenceRow />
        </section>

        <div className="relative hidden h-80 rounded-lg border border-line bg-raised bg-dot-grid bg-dots shadow-raised lg:block">
          <span className="absolute right-3 top-3 rounded font-mono text-[10px] uppercase tracking-wide text-ink-400">
            Preview
          </span>
          <div className="absolute left-[18%] top-[22%] rounded-md border border-line bg-warn/90 px-4 py-3 text-sm font-medium text-ink shadow-float">
            ship v2 🚀
          </div>
          <div className="absolute left-[52%] top-[52%] h-20 w-28 rounded-md border-2 border-presence-teal/70" />
          <CursorFlag name="Maya" color="#3B5BFF" className="left-[58%] top-[30%]" />
          <CursorFlag name="Leo" color="#FF5A5F" className="left-[24%] top-[60%]" />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <ApiStatusCard />
      </div>
    </main>
  );
}

function GitHubIcon({ className = '' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.91 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function PresenceRow(): JSX.Element {
  const names = ['Maya', 'Leo', 'Amir', 'Jun'];
  return (
    <div className="mt-8 flex items-center gap-3">
      <div className="flex -space-x-2">
        {names.map((name, i) => (
          <span
            key={name}
            title={name}
            className="grid h-8 w-8 place-items-center rounded-full border-2 border-paper text-xs font-semibold text-white"
            style={{ backgroundColor: PRESENCE_PALETTE[i % PRESENCE_PALETTE.length] }}
          >
            {name[0]}
          </span>
        ))}
      </div>
      <span className="font-mono text-xs text-ink-400">Presence and live cursors, built in</span>
    </div>
  );
}

function ApiStatusCard(): JSX.Element {
  const { state, refresh } = useApiHealth();
  return (
    <section
      aria-live="polite"
      className="rounded-lg border border-line bg-raised p-5 shadow-raised"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-ink">Backend status</h2>
        <button
          onClick={refresh}
          className="rounded-md px-2 py-1 font-mono text-xs text-ink-600 hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          refresh
        </button>
      </div>
      {state.phase === 'loading' && (
        <div className="mt-3 flex items-center gap-2 text-ink-600">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-ink-400" />
          <span className="text-sm">Checking the API…</span>
        </div>
      )}
      {state.phase === 'error' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-danger" />
          <span className="text-sm font-medium text-ink">{state.message}</span>
        </div>
      )}
      {state.phase === 'ready' && <StatusDetails data={state.data} />}
    </section>
  );
}

function StatusDetails({ data }: { data: HealthStatus }): JSX.Element {
  const { label, tone } = describeStatus(data.status);
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${TONE_CLASS[tone]}`} />
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="font-mono text-xs text-ink-400">· {data.service}</span>
      </div>
      {data.details && (
        <ul className="mt-3 grid max-w-md grid-cols-2 gap-2">
          {Object.entries(data.details).map(([name, depState]) => (
            <li key={name} className="flex items-center justify-between rounded-md bg-sunken px-3 py-2">
              <span className="text-sm capitalize text-ink-600">{name}</span>
              <span className={`font-mono text-xs ${depState === 'up' ? 'text-success' : 'text-danger'}`}>
                {depState}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
