import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { BoardVersion } from '@syncflow/shared';
import { useDialogFocus } from '@/hooks/use-dialog-focus';
import { useAuth } from '@/features/auth/auth-context';
import { useBoard } from '@/features/boards/hooks/use-boards';
import { useRestoreVersion, useVersions } from '../hooks/use-versions';

const REASON_LABELS: Record<BoardVersion['reason'], string> = {
  autosave: 'Autosave',
  restore: 'Restore',
  manual: 'Manual',
};

const REASON_BADGE: Record<BoardVersion['reason'], string> = {
  autosave: 'bg-sunken text-ink-400 dark:bg-sunken-dark dark:text-ink-dark',
  restore: 'bg-warn/15 text-ink',
  manual: 'bg-success/15 text-success',
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

/**
 * Who made a version. `createdBy` is null for server-side snapshots; a null
 * `createdByName` with an author id means the account no longer resolves.
 */
function authorLabel(version: BoardVersion, currentUserId: string | undefined): string {
  if (!version.createdBy) return 'Automatic';
  if (version.createdBy === currentUserId) return 'You';
  return version.createdByName?.trim() ? version.createdByName : 'A collaborator';
}

const BUTTON_OUTLINE =
  'shrink-0 rounded-md border border-line px-2 py-1 text-xs text-ink-600 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-dark dark:text-ink-dark dark:hover:bg-raised-dark';

function VersionRow({
  version,
  author,
  canRestore,
  confirming,
  restoring,
  disabled,
  onAsk,
  onCancel,
  onConfirm,
}: {
  version: BoardVersion;
  author: string;
  canRestore: boolean;
  confirming: boolean;
  restoring: boolean;
  disabled: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const restoreRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) restoreRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const n = version.docVersion;
  return (
    <li className="rounded-md px-2 py-2 hover:bg-sunken dark:hover:bg-sunken-dark">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${REASON_BADGE[version.reason]}`}>
              {REASON_LABELS[version.reason]}
            </span>
            <span className="font-mono text-[11px] text-ink-400 dark:text-ink-dark">#{n}</span>
          </div>
          <p className="mt-1 truncate text-xs text-ink-600 dark:text-ink-dark">
            {relativeTime(version.createdAt)} · {author}
          </p>
        </div>
        {canRestore && !confirming && (
          <button
            ref={restoreRef}
            onClick={onAsk}
            disabled={disabled}
            aria-label={`Restore version #${n}`}
            className={BUTTON_OUTLINE}
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-2 rounded-md bg-warn/15 px-2 py-2">
          <p className="text-xs text-ink-600 dark:text-ink-dark">
            Restore version #{n}? The board will revert to this snapshot for everyone.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button ref={cancelRef} onClick={onCancel} className={BUTTON_OUTLINE}>
              Cancel
            </button>
            <button
              onClick={onConfirm}
              aria-label={`Confirm restore version #${n}`}
              className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium text-on-accent hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Restore
            </button>
          </div>
        </div>
      )}
    </li>
  );
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
  const { user } = useAuth();
  const boardQuery = useBoard(boardId);
  const versionsQuery = useVersions(boardId, open);
  const restore = useRestoreVersion(boardId);
  const [pending, setPending] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  useDialogFocus(panelRef, { onClose, active: open });

  const canRestore = boardQuery.data !== undefined && boardQuery.data.role !== 'viewer';

  if (!open) return null;

  function handleRestore(docVersion: number): void {
    setConfirming(null);
    setPending(docVersion);
    restore.mutate(docVersion, {
      onSettled: () => setPending(null),
    });
  }

  // Portal out: a fixed panel is trapped by any ancestor with transform/filter/backdrop-filter.
  return createPortal(
    <aside
      ref={panelRef}
      className="fixed bottom-0 right-0 top-0 z-30 flex md:bottom-8 md:top-[52px] w-full flex-col sm:w-80 border-l border-line bg-chrome shadow-float md:shadow-none"
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
          className="rounded-md p-1.5 text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          <X size={16} aria-hidden="true" />
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
            <p className="text-sm text-danger">
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
              <VersionRow
                key={v.docVersion}
                version={v}
                author={authorLabel(v, user?.id)}
                canRestore={canRestore}
                confirming={confirming === v.docVersion}
                restoring={pending === v.docVersion}
                disabled={restore.isPending}
                onAsk={() => setConfirming(v.docVersion)}
                onCancel={() => setConfirming(null)}
                onConfirm={() => handleRestore(v.docVersion)}
              />
            ))}
          </ul>
        )}
      </div>

      {restore.isError && (
        <p
          className="border-t border-line px-4 py-2 text-xs text-danger dark:border-line-dark"
          role="alert"
        >
          Restore failed. Please try again.
        </p>
      )}
    </aside>,
    document.body,
  );
}
