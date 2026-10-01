import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PRESENCE_PALETTE, type HealthStatus } from '@syncflow/shared';
import { Brand } from '@/components/brand';
import { LogoMark } from '@/components/logo-mark';
import { CursorFlag } from '@/components/cursor-flag';
import { useApiHealth } from '@/hooks/use-api-health';
import { describeStatus, TONE_CLASS } from '@/lib/health-status';
import { useAuth } from '@/features/auth/auth-context';

const REPO_URL = 'https://github.com/taizhixuan/SyncFlow';
const PROFILE_URL = 'https://github.com/taizhixuan';

export function LandingPage(): JSX.Element {
  const { status } = useAuth();
  const primaryHref = status === 'authenticated' ? '/app' : '/signup';
  const primaryLabel = status === 'authenticated' ? 'Open app' : 'Start free';

  return (
    <>
      <main className="min-h-[100dvh] bg-paper">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Brand />
          <nav className="flex items-center gap-2">
            <a
              href={REPO_URL}
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
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-110"
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
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-110"
                >
                  Start free
                </Link>
              </>
            )}
          </nav>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 lg:grid-cols-[5fr_6fr] lg:pt-20">
          <section>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
              Real-time · CRDT · Offline-first
            </p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl">
              One canvas.
              <br />
              Every cursor.
              <br />
              <span className="text-ink-400">Zero conflicts.</span>
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-600">
              A collaborative whiteboard built on Yjs. Every edit merges cleanly, even ones made offline, and live
              cursors show who’s working where.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={primaryHref}
                className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-semibold text-on-accent hover:brightness-105"
              >
                {primaryLabel}
              </Link>
              <Link
                to="/app/board/local"
                className="inline-flex h-11 items-center gap-1 rounded-md border border-line bg-raised px-5 text-sm font-medium text-ink hover:border-line-strong"
              >
                Try the canvas
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <PresenceRow />
          </section>

          <EditorPreview />
        </div>

        <Features />
        <Thesis />
        <TechStrip />

        <section className="mx-auto max-w-6xl px-6 pb-16">
          <SectionEyebrow>Live backend</SectionEyebrow>
          <p className="mb-4 max-w-xl text-sm text-ink-600">
            This page pings the production API right now. No mock data.
          </p>
          <ApiStatusCard />
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-ink-400">{children}</p>
  );
}

const FEATURES: { title: string; body: string }[] = [
  { title: 'Conflict-free sync', body: 'Edits merge with Yjs CRDTs. No locks, no last-write-wins.' },
  { title: 'Live presence', body: "Every teammate's cursor, selection, and name, in real time." },
  { title: 'Works offline', body: 'Keep editing while disconnected; changes reconcile on reconnect.' },
  { title: 'Scales horizontally', body: 'Updates fan out across servers over Redis pub/sub.' },
  { title: 'Collaboration-aware undo', body: "Undo your own changes without touching anyone else's." },
  { title: 'Version history', body: 'Rewind to any snapshot and restore without interrupting the room.' },
];

function Features(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <SectionEyebrow>What is inside</SectionEyebrow>
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Everything a team needs on one canvas.</h2>
      <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <li key={f.title} className="border-t border-line pt-5">
            <span className="font-mono text-xs text-brand">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="mt-2 text-[15px] font-semibold text-ink">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{f.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A static, scaled-down picture of the editor in the current theme: the same
 * chrome (top bar, rail, status bar) the real board uses, so the landing page
 * shows the product rather than an illustration of it.
 */
function EditorPreview(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="relative h-[300px] overflow-hidden rounded-xl border border-line bg-paper shadow-float sm:h-[420px]"
    >
      <div className="absolute inset-x-0 top-0 flex h-10 items-center gap-2 border-b border-line bg-chrome px-3">
        <LogoMark size={20} />
        <span className="text-xs text-ink-400">Product /</span>
        <span className="text-xs font-semibold text-ink">Launch plan</span>
        <span className="ml-auto flex -space-x-1.5">
          {PRESENCE_PALETTE.slice(1, 4).map((c) => (
            <span key={c} className="h-5 w-5 rounded-full border-2 border-chrome" style={{ backgroundColor: c }} />
          ))}
        </span>
        <span className="rounded bg-accent px-2 py-1 text-[10px] font-semibold text-on-accent">Share</span>
      </div>
      <div className="absolute bottom-7 left-0 top-10 flex w-10 flex-col items-center gap-2 border-r border-line bg-chrome pt-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className={`h-5 w-5 rounded ${i === 0 ? 'bg-accent/30 ring-1 ring-brand/50' : 'bg-sunken'}`} />
        ))}
      </div>
      <div className="absolute bottom-7 left-10 right-0 top-10 bg-dot-grid bg-dots">
        <PreviewSticky className="left-[8%] top-[12%] bg-[#F2DC84]">Ship offline mode before the beta</PreviewSticky>
        <PreviewSticky className="left-[34%] top-[12%] bg-[#F6AEC0]">Record a demo for the README</PreviewSticky>
        <PreviewSticky className="left-[8%] top-[48%] bg-[#97E3BF]">Invite the design team</PreviewSticky>
        <PreviewSticky className="left-[34%] top-[48%] bg-[#C4B5FD] outline outline-[1.5px] outline-offset-2 outline-brand">
          Write the migration notes
        </PreviewSticky>
        <div className="absolute left-[66%] top-[16%] grid h-12 w-28 place-items-center rounded-lg border border-line-strong bg-raised text-xs font-medium text-ink">
          Beta
        </div>
        <div className="absolute left-[66%] top-[56%] grid h-12 w-28 place-items-center rounded-lg bg-accent text-xs font-semibold text-on-accent">
          Launch
        </div>
        <div className="absolute left-[calc(66%+3.5rem)] top-[calc(16%+3rem)] h-[calc(40%-3rem)] w-px bg-ink-400" />
        <CursorFlag name="Maya" color={PRESENCE_PALETTE[1] ?? '#FF5A5F'} className="left-[26%] top-[74%]" />
        <CursorFlag name="Leo" color={PRESENCE_PALETTE[3] ?? '#12B5A5'} className="left-[84%] top-[34%]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-7 items-center gap-3 border-t border-line bg-chrome px-3 font-mono text-[10px] text-ink-400">
        <span className="flex items-center gap-1.5 text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          live
        </span>
        <span>3 online</span>
        <span className="ml-auto">100%</span>
      </div>
    </div>
  );
}

function PreviewSticky({ className, children }: { className: string; children: ReactNode }): JSX.Element {
  return (
    <div className={`absolute h-20 w-[24%] rounded p-2 text-[11px] leading-snug text-[#16161A] shadow-raised ${className}`}>
      {children}
    </div>
  );
}

const GUARANTEES: { label: string; body: string }[] = [
  { label: 'Converges', body: 'Concurrent edits resolve to the same state on every client.' },
  { label: 'Survives', body: 'Reconnects, reloads, and server restarts keep your work.' },
  { label: 'Scales', body: 'Any server can serve any client; Redis keeps them in lockstep.' },
];

function Thesis(): JSX.Element {
  return (
    <section className="mx-auto grid max-w-5xl items-start gap-8 px-6 py-12 lg:grid-cols-2">
      <div>
        <SectionEyebrow>The hard part</SectionEyebrow>
        <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
          Distributed real-time state, done right.
        </h2>
        <p className="mt-4 max-w-xl text-ink-600">
          Two people can drag the same shape at the same instant and still land on the same result. The
          canvas is a CRDT, so changes merge by design. The server stores periodic snapshots; it never
          invents state.
        </p>
      </div>
      <dl className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised">
        {GUARANTEES.map((g) => (
          <div key={g.label} className="flex items-start gap-4 px-5 py-4">
            <dt className="w-24 shrink-0 font-mono text-xs uppercase tracking-wide text-brand">{g.label}</dt>
            <dd className="text-sm text-ink-600">{g.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const TECH = ['React', 'TypeScript', 'Yjs', 'Socket.IO', 'NestJS', 'PostgreSQL', 'Redis', 'Konva'];

function TechStrip(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <SectionEyebrow>Built with</SectionEyebrow>
      <ul className="flex flex-wrap gap-2">
        {TECH.map((t) => (
          <li
            key={t}
            className="rounded-full border border-line bg-raised px-3 py-1 font-mono text-xs text-ink-600"
          >
            {t}
          </li>
        ))}
      </ul>
    </section>
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
      className="rounded-lg border border-line bg-raised p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Backend status</h2>
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

function SiteFooter(): JSX.Element {
  return (
    <footer className="border-t border-line bg-chrome">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Brand />
            <p className="mt-2 text-sm text-ink-400">The whiteboard that stays in sync.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-ink-600 transition hover:text-ink">
              GitHub
            </a>
            <Link to="/app/board/local" className="text-ink-600 transition hover:text-ink">
              Try the canvas
            </Link>
            <a
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer"
              className="text-ink-600 transition hover:text-ink"
            >
              MIT License
            </a>
          </nav>
        </div>
        <p className="mt-8 font-mono text-xs text-ink-400">
          Built by{' '}
          <a href={PROFILE_URL} target="_blank" rel="noreferrer" className="hover:text-ink-600">
            Tai Zhi Xuan
          </a>{' '}
          · MIT licensed
        </p>
      </div>
    </footer>
  );
}
