/**
 * comments-doc.ts — helpers for the `ydoc.getMap('comments')` slice.
 *
 * Comments live in a SEPARATE Y.Map from `elements`. This means:
 *  - They sync and persist automatically (server relays whole-doc updates).
 *  - They are NOT tracked by the UndoManager (scoped to elements only).
 *  - Version restore rolls them back along with elements and meta: the
 *    server's reconcileToSnapshot covers every top-level map.
 *
 * Each thread is a nested Y.Map whose `replies` is a Y.Array. Storing the
 * thread as one plain value meant a reply was "read thread, write whole thread
 * back", so two people replying at once each overwrote the other's reply, and
 * a resolve could erase a reply sent in the same moment. With per-field keys
 * and an append-only array, concurrent replies and resolves all merge.
 *
 * Boards saved before this change hold plain thread objects; reads accept
 * both, and the first write to a legacy thread converts it.
 *
 * All writes use COMMENT_ORIGIN so the socket provider broadcasts them
 * (only REMOTE_ORIGIN is suppressed) but they never enter the element undo stack.
 */

import * as Y from 'yjs';
import { commentSchema, type Comment, type CommentReply } from '@syncflow/shared';

export type YComments = Y.Map<unknown>;

/** Distinct origin for comment mutations — not LOCAL_ORIGIN (so not in undo stack)
 *  and not REMOTE_ORIGIN (so socket provider broadcasts them). */
export const COMMENT_ORIGIN = Symbol('comment');

export function getCommentsMap(ydoc: Y.Doc): YComments {
  return ydoc.getMap<unknown>('comments');
}

function toYThread(c: Comment): Y.Map<unknown> {
  const thread = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(c)) {
    if (k === 'replies' || v === undefined) continue;
    thread.set(k, v);
  }
  const replies = new Y.Array<CommentReply>();
  replies.push(c.replies);
  thread.set('replies', replies);
  return thread;
}

function readThread(value: unknown): unknown {
  if (value instanceof Y.Map) return value.toJSON();
  return value;
}

const warnedInvalid = new Set<string>();

export function toPlainComments(comments: YComments): Comment[] {
  const result: Comment[] = [];
  comments.forEach((value, id) => {
    const parsed = commentSchema.safeParse(readThread(value));
    if (parsed.success && parsed.data.id === id) {
      result.push(parsed.data);
    } else if (!warnedInvalid.has(id)) {
      // A peer can write anything here; one bad thread must not take down the
      // comments layer for everyone, so drop it and say so once.
      warnedInvalid.add(id);
      console.warn(`[comments] dropping invalid comment "${id}"`, parsed.error?.issues ?? 'id mismatch');
    }
  });
  return result.sort((a, b) => a.createdAt - b.createdAt);
}

/** The thread as a Y.Map, converting a legacy plain value in place. */
function threadFor(comments: YComments, id: string): Y.Map<unknown> | null {
  const value = comments.get(id);
  if (value instanceof Y.Map) return value;
  const parsed = commentSchema.safeParse(value);
  if (!parsed.success) return null;
  const thread = toYThread(parsed.data);
  comments.set(id, thread);
  return thread;
}

/** Insert a new thread. Call inside a COMMENT_ORIGIN transaction. */
export function insertComment(comments: YComments, comment: Comment): void {
  comments.set(comment.id, toYThread(comment));
}

/** Append one reply without rewriting the thread. */
export function appendReply(comments: YComments, commentId: string, reply: CommentReply): boolean {
  const thread = threadFor(comments, commentId);
  if (!thread) return false;
  const replies = thread.get('replies');
  if (replies instanceof Y.Array) {
    replies.push([reply]);
  } else {
    const fresh = new Y.Array<CommentReply>();
    fresh.push([reply]);
    thread.set('replies', fresh);
  }
  return true;
}

/** Flip only the `resolved` field, leaving replies untouched. */
export function setResolved(comments: YComments, commentId: string, resolved: boolean): boolean {
  const thread = threadFor(comments, commentId);
  if (!thread) return false;
  thread.set('resolved', resolved);
  return true;
}
