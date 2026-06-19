import { Link } from 'react-router-dom';
import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';

export function CanvasTopBar({ store, title }: { store: CanvasStore; title: string }): JSX.Element {
  const theme = useStore(store, (s) => s.theme);
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
        <span className="rounded-full bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-400 dark:bg-sunken-dark">
          local
        </span>
      </div>
      <button
        onClick={() => s.toggleTheme()}
        aria-label="Toggle dark mode"
        className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark"
      >
        {theme === 'dark' ? '☀ Light' : '☾ Dark'}
      </button>
    </header>
  );
}
