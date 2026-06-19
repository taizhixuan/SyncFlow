/**
 * comments-doc.ts — helpers for the `ydoc.getMap('comments')` slice.
 *
 * Comments live in a SEPARATE Y.Map from `elements`. This means:
 *  - They sync and persist automatically (server relays whole-doc updates).
 *  - They are NOT tracked by the UndoManager (scoped to elements only).
 *  - version-restore does NOT roll back comments (reconcileToSnapshot only
 *    reconciles elements). This is intentional.
 *
 * All writes use COMMENT_ORIGIN so the socket provider broadcasts them
 * (only REMOTE_ORIGIN is suppressed) but they never enter the element undo stack.
 */

import * as Y from 'yjs';
import type { Comment } from '@syncflow/shared';

export type YComments = Y.Map<Comment>;

/** Distinct origin for comment mutations — not LOCAL_ORIGIN (so not in undo stack)
 *  and not REMOTE_ORIGIN (so socket provider broadcasts them). */
export const COMMENT_ORIGIN = Symbol('comment');

export function getCommentsMap(ydoc: Y.Doc): YComments {
  return ydoc.getMap<Comment>('comments');
}

export function toPlainComments(comments: YComments): Comment[] {
  const result: Comment[] = [];
  comments.forEach((c) => {
    result.push(c);
  });
  return result.sort((a, b) => a.createdAt - b.createdAt);
}
