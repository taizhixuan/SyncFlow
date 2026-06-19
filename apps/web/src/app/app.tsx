import { PRESENCE_PALETTE, type HealthStatus } from '@syncflow/shared';
import { useApiHealth } from '@/hooks/use-api-health';
import { describeStatus, TONE_CLASS } from '@/lib/health-status';

export function App(): JSX.Element {
  return (
    <main className="min-h-screen bg-paper bg-dot-grid bg-dots">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <Brand />
        <h1 className="mt-8 font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
          The whiteboard that
          <br />
          stays in sync.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-600">
          Real-time canvas. Live cursors. Conflict-free editing that just works — even offline.
        </p>

        <PresenceRow />
        <ApiStatusCard />

        <p className="mt-10 font-mono text-xs text-ink-400">
          Phase 2 · scaffold + infrastructure online. Auth, boards, and the canvas land next.
        </p>
      </div>
    </main>
  );
}

function Brand(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-brand font-display text-sm font-bold text-white">
        S
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">SyncFlow</span>
    </div>
  );
}

function PresenceRow(): JSX.Element {
  // The signature motif: collaborators as colored presence (wireframes §1).
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
      className="mt-8 rounded-lg border border-line bg-raised p-5 shadow-raised"
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
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" />
            <span className="text-sm font-medium text-ink">{state.message}</span>
          </div>
          <p className="mt-1 text-sm text-ink-600">
            Start the stack with <code className="font-mono text-xs">pnpm compose:up</code> then{' '}
            <code className="font-mono text-xs">pnpm dev</code>.
          </p>
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
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(data.details).map(([name, depState]) => (
            <li
              key={name}
              className="flex items-center justify-between rounded-md bg-sunken px-3 py-2"
            >
              <span className="text-sm capitalize text-ink-600">{name}</span>
              <span
                className={`font-mono text-xs ${depState === 'up' ? 'text-success' : 'text-danger'}`}
              >
                {depState}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
