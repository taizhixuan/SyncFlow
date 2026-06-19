/**
 * comments-panel.tsx — slide-over side panel listing all comment threads.
 *
 * Mirrors version-history-panel.tsx for structure and styling.
 * Comments are local-synced via Yjs (no HTTP fetch), so "loading" is
 * instantaneous, but we still render explicit empty and error states.
 */

import { useState } from 'react';
import { useStore } from 'zustand';
import type { Comment } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';

interface Props {
  store: CanvasStore;
  open: boolean;
  onClose: () => void;
  /** The current user — needed to gate delete (author or board owner). */
  currentUser?: { id: string; name: string };
  /** Whether the current user has owner/editor role (can delete any comment). */
  canModerateAll?: boolean;
}

/** Human-readable "x ago" for a unix-ms timestamp. */
function relativeTime(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function ReplyComposer({
  onSubmit,
  authorName,
}: {
  onSubmit: (body: string) => void;
  authorName: string;
}): JSX.Element {
  const [value, setValue] = useState('');
  return (
    <form
      className="mt-2 flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setValue('');
      }}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Reply as ${authorName}…`}
        rows={2}
        aria-label="Reply body"
        className="w-full resize-none rounded-md border border-line bg-sunken px-2 py-1.5 text-xs text-ink placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-brand dark:border-line-dark dark:bg-sunken-dark dark:text-ink-dark"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="self-end rounded-md border border-line px-2 py-1 text-xs text-ink-600 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 dark:border-line-dark dark:text-ink-dark dark:hover:bg-raised-dark"
      >
        Reply
      </button>
    </form>
  );
}

function CommentThread({
  comment,
  isOpen,
  canDelete,
  onResolve,
  onReply,
  onDelete,
  onOpen,
  currentUser,
}: {
  comment: Comment;
  isOpen: boolean;
  canDelete: boolean;
  onResolve: (resolved: boolean) => void;
  onReply: (body: string) => void;
  onDelete: () => void;
  onOpen: () => void;
  currentUser?: { id: string; name: string };
}): JSX.Element {
  return (
    <li
      className={`rounded-md px-3 py-2 ${isOpen ? 'bg-sunken dark:bg-sunken-dark' : 'hover:bg-sunken dark:hover:bg-sunken-dark'}`}
    >
      {/* Thread header */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onOpen}
          className="flex-1 text-left"
          aria-label={`Open thread by ${comment.authorName}`}
        >
          <p className="text-xs font-semibold text-ink dark:text-ink-dark">{comment.authorName}</p>
          <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-dark">{comment.body}</p>
          <p className="mt-1 text-[10px] text-ink-400 dark:text-ink-dark">{relativeTime(comment.createdAt)}</p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {comment.resolved ? (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Resolved
            </span>
          ) : null}
          <button
            onClick={() => onResolve(!comment.resolved)}
            title={comment.resolved ? 'Reopen' : 'Resolve'}
            className="rounded px-1.5 py-0.5 text-[10px] text-ink-400 hover:bg-raised dark:hover:bg-raised-dark"
          >
            {comment.resolved ? '↩' : '✓'}
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              title="Delete thread"
              className="rounded px-1.5 py-0.5 text-[10px] text-danger hover:bg-raised dark:hover:bg-raised-dark"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-l-2 border-line pl-2 dark:border-line-dark">
          {comment.replies.map((r) => (
            <li key={r.id}>
              <p className="text-[11px] font-semibold text-ink dark:text-ink-dark">{r.authorName}</p>
              <p className="text-[11px] text-ink-600 dark:text-ink-dark">{r.body}</p>
              <p className="text-[10px] text-ink-400 dark:text-ink-dark">{relativeTime(r.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Reply composer — shown when thread is open */}
      {isOpen && currentUser && (
        <ReplyComposer
          authorName={currentUser.name}
          onSubmit={onReply}
        />
      )}
    </li>
  );
}

export function CommentsPanel({ store, open, onClose, currentUser, canModerateAll = false }: Props): JSX.Element | null {
  const comments = useStore(store, (s) => s.comments);
  const openCommentId = useStore(store, (s) => s.openCommentId);
  const s = store.getState();
  const [showResolved, setShowResolved] = useState(false);

  if (!open) return null;

  const visible = showResolved ? comments : comments.filter((c) => !c.resolved);

  return (
    <aside
      className="fixed right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-line bg-raised shadow-xl dark:border-line-dark dark:bg-raised-dark"
      role="dialog"
      aria-label="Comments"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line-dark">
        <h2 className="font-display text-sm font-semibold text-ink dark:text-ink-dark">
          Comments
          {comments.length > 0 && (
            <span className="ml-2 rounded-full bg-sunken px-1.5 py-0.5 text-[11px] font-normal text-ink-400 dark:bg-sunken-dark">
              {comments.length}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResolved((v) => !v)}
            aria-pressed={showResolved}
            title={showResolved ? 'Hide resolved' : 'Show resolved'}
            className={`rounded-md px-2 py-1 text-xs hover:bg-sunken dark:hover:bg-sunken-dark ${showResolved ? 'text-brand' : 'text-ink-400 dark:text-ink-dark'}`}
          >
            {showResolved ? '⊙ All' : '⊙ Open'}
          </button>
          <button
            onClick={onClose}
            aria-label="Close comments panel"
            className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Empty state — required per spec */}
        {comments.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-ink-400 dark:text-ink-dark">
            No comments yet. Right-click an element to add one.
          </p>
        )}

        {comments.length > 0 && visible.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-ink-400 dark:text-ink-dark">
            No open comments. Toggle "All" to see resolved threads.
          </p>
        )}

        {visible.length > 0 && (
          <ul className="flex flex-col gap-1">
            {visible.map((comment) => {
              const canDelete =
                canModerateAll || (currentUser !== undefined && comment.authorId === currentUser.id);
              return (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  isOpen={comment.id === openCommentId}
                  canDelete={canDelete}
                  currentUser={currentUser}
                  onOpen={() => s.setOpenCommentId(comment.id === openCommentId ? null : comment.id)}
                  onResolve={(resolved) => s.resolveComment(comment.id, resolved)}
                  onReply={(body) => {
                    if (!currentUser) return;
                    s.replyToComment(comment.id, { body, author: currentUser });
                  }}
                  onDelete={() => s.deleteComment(comment.id)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
