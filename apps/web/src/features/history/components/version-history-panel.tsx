import { useState } from 'react';
import type { BoardVersion } from '@syncflow/shared';
import { useBoard } from '@/features/boards/hooks/use-boards';
import { useRestoreVersion, useVersions } from '../hooks/use-versions';

const REASON_LABELS: Record<BoardVersion['reason'], string> = {
  autosave: 'Autosave',
  restore: 'Restore',
  manual: 'Manual',
};

const REASON_BADGE: Record<BoardVersion['reason'], string> = {
  autosave: 'bg-sunken text-ink-400 dark:bg-sunken-dark dark:text-ink-dark',
  restore: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  manual: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

/** Human-readable "x ago" for an ISO timestamp. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function VersionHistoryPanel({
  boardId,
  open,
  onClose,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const boardQuery = useBoard(boardId);
  const versionsQuery = useVersions(boardId);
  const restore = useRestoreVersion(boardId);
  const [pending, setPending] = useState<number | null>(null);

  const canRestore = boardQuery.data?.role !== 'viewer';

  if (!open) return null;

  function handleRestore(docVersion: number): void {
    const ok = window.confirm(
      `Restore version #${docVersion}? The board will revert to this snapshot for everyone.`,
    );
    if (!ok) return;
    setPending(docVersion);
    restore.mutate(docVersion, {
      onSettled: () => setPending(null),
    });
  }

  return (
    <aside
      className="fixed right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-line bg-raised shadow-xl dark:border-line-dark dark:bg-raised-dark"
      role="dialog"
      aria-label="Version history"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line-dark">
        <h2 className="font-display text-sm font-semibold text-ink dark:text-ink-dark">
          Version history
        </h2>
        <button
          onClick={onClose}
          aria-label="Close version history"
          className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {versionsQuery.isLoading && (
          <p className="px-2 py-8 text-center text-sm text-ink-400 dark:text-ink-dark">
            Loading versions…
          </p>
        )}

        {versionsQuery.isError && (
          <div className="px-2 py-8 text-center">
            <p className="text-sm text-rose-600 dark:text-rose-400">
              Couldn’t load version history.
            </p>
            <button
              onClick={() => void versionsQuery.refetch()}
              className="mt-2 rounded-md px-2 py-1 text-sm text-brand hover:bg-sunken dark:hover:bg-sunken-dark"
            >
              Retry
            </button>
          </div>
        )}

        {versionsQuery.isSuccess && versionsQuery.data.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-ink-400 dark:text-ink-dark">
            No versions yet. Edits are snapshotted automatically as you work.
          </p>
        )}

        {versionsQuery.isSuccess && versionsQuery.data.length > 0 && (
          <ul className="flex flex-col gap-1">
            {versionsQuery.data.map((v) => (
              <li
                key={v.docVersion}
                className="rounded-md px-2 py-2 hover:bg-sunken dark:hover:bg-sunken-dark"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${REASON_BADGE[v.reason]}`}
                      >
                        {REASON_LABELS[v.reason]}
                      </span>
                      <span className="font-mono text-[11px] text-ink-400 dark:text-ink-dark">
                        #{v.docVersion}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-600 dark:text-ink-dark">
                      {relativeTime(v.createdAt)}
                      {v.createdBy ? ` · ${v.createdBy.slice(0, 8)}` : ' · system'}
                    </p>
                  </div>
                  {canRestore && (
                    <button
                      onClick={() => handleRestore(v.docVersion)}
                      disabled={restore.isPending}
                      className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-ink-600 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:text-ink-dark dark:hover:bg-raised-dark"
                    >
                      {pending === v.docVersion ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {restore.isError && (
        <p
          className="border-t border-line px-4 py-2 text-xs text-rose-600 dark:border-line-dark dark:text-rose-400"
          role="alert"
        >
          Restore failed. Please try again.
        </p>
      )}
    </aside>
  );
}
