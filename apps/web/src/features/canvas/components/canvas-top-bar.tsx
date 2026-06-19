import { Link } from 'react-router-dom';

export function CanvasTopBar({ title }: { title: string }): JSX.Element {
  return (
    <header className="flex items-center justify-between border-b border-line bg-raised px-4 py-2">
      <div className="flex items-center gap-3">
        <Link
          to="/app"
          className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          ← Boards
        </Link>
        <span className="font-display text-sm font-semibold text-ink">{title}</span>
        <span className="rounded-full bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-400">
          local
        </span>
      </div>
      <span className="font-mono text-xs text-ink-400">solo · not synced yet</span>
    </header>
  );
}
