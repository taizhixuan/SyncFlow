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
            Real-time canvas. Live cursors. Conflict-free editing that just works — even offline.
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
      <span className="font-mono text-xs text-ink-400">4 people on a board right now</span>
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
