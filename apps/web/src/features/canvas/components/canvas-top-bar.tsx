import { Link } from 'react-router-dom';
import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import { PresenceAvatars } from '@/features/presence/presence-avatars';
import type { CanvasStore } from '../engine/canvas-store';

export function CanvasTopBar({
  store,
  title,
  badge,
  connection,
  awareness,
  onToggleHistory,
  historyOpen,
  onToggleComments,
  commentsOpen,
  onToggleTimer,
  timerOpen,
  onToggleTemplates,
  templatesOpen,
  onToggleLibrary,
  libraryOpen,
}: {
  store: CanvasStore;
  title: string;
  badge?: string;
  connection?: 'offline' | 'connecting' | 'live';
  awareness?: Awareness;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
  onToggleComments?: () => void;
  commentsOpen?: boolean;
  onToggleTimer?: () => void;
  timerOpen?: boolean;
  onToggleTemplates?: () => void;
  templatesOpen?: boolean;
  onToggleLibrary?: () => void;
  libraryOpen?: boolean;
}): JSX.Element {
  const theme = useStore(store, (s) => s.theme);
  const gridEnabled = useStore(store, (s) => s.gridEnabled);
  const votingMode = useStore(store, (s) => s.votingMode);
  const s = store.getState();
  return (
    <header className="flex items-center justify-between border-b border-line bg-raised px-4 py-2 dark:border-line-dark dark:bg-raised-dark">
      <div className="flex items-center gap-3">
        <Link
          to="/app"
          className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark"
        >
          ← Boards
        </Link>
        <span className="font-display text-sm font-semibold text-ink dark:text-ink-dark">{title}</span>
        {badge && (
          <span className="rounded-full bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-400 dark:bg-sunken-dark">
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {awareness && <PresenceAvatars awareness={awareness} />}
        {connection && connection !== 'offline' && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              connection === 'live'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
            role="status"
          >
            {connection === 'live' ? '● live' : '○ reconnecting…'}
          </span>
        )}
        <button
          onClick={() => s.toggleGrid()}
          aria-label="Toggle grid"
          aria-pressed={gridEnabled}
          className={`rounded-md px-2 py-1 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${gridEnabled ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'}`}
        >
          ⊞ Grid
        </button>
        <button
          onClick={() => s.toggleTheme()}
          aria-label="Toggle dark mode"
          className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark"
        >
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
        {onToggleComments && (
          <button
            onClick={onToggleComments}
            aria-label="Toggle comments panel"
            aria-pressed={commentsOpen}
            className={`rounded-md px-2 py-1 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${commentsOpen ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'}`}
          >
            💬 Comments
          </button>
        )}
        <button
          onClick={() => s.toggleVotingMode()}
          aria-label="Toggle voting mode"
          aria-pressed={votingMode}
          title={votingMode ? 'Exit voting mode (click elements to select)' : 'Enter voting mode (click elements to vote)'}
          className={`rounded-md px-2 py-1 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${votingMode ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'text-ink-600 dark:text-ink-dark'}`}
        >
          🗳 Vote
        </button>
        {onToggleTimer && (
          <button
            onClick={onToggleTimer}
            aria-label="Toggle timer"
            aria-pressed={timerOpen}
            className={`rounded-md px-2 py-1 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${timerOpen ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'}`}
          >
            ⏱ Timer
          </button>
        )}
        {onToggleTemplates && (
          <button
            onClick={onToggleTemplates}
            aria-label="Toggle templates drawer"
            aria-pressed={templatesOpen}
            className={`rounded-md px-2 py-1 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${templatesOpen ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'}`}
          >
            ⊞ Templates
          </button>
        )}
        {onToggleLibrary && (
          <button
            onClick={onToggleLibrary}
            aria-label="Toggle component library"
            aria-pressed={libraryOpen}
            className={`rounded-md px-2 py-1 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${libraryOpen ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'}`}
          >
            ⊟ Library
          </button>
        )}
        {onToggleHistory && (
          <button
            onClick={onToggleHistory}
            aria-label="Toggle version history"
            aria-pressed={historyOpen}
            className={`rounded-md px-2 py-1 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${historyOpen ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'}`}
          >
            ⟲ History
          </button>
        )}
      </div>
    </header>
  );
}
