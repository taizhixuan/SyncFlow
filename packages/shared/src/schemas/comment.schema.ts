import { z } from 'zod';

export const commentReplySchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.number(),
});
export type CommentReply = z.infer<typeof commentReplySchema>;

/**
 * A comment thread pinned either to a canvas element or to an absolute board
 * point. Exactly one of `elementId` or `point` is set.
 *
 * Comments live in `ydoc.getMap('comments')` — a separate Y.Map from the
 * `elements` map. This means:
 *   - They sync and persist for free (server relays whole-doc updates and
 *     snapshots the whole doc), with NO server-side changes required.
 *   - They are NOT tracked by the UndoManager (which is scoped to `elements`
 *     only). Comment edits are outside element undo/redo by design.
 *   - version-restore (reconcileToSnapshot) only reconciles `elements`, so it
 *     will NOT roll back comments. This is acceptable — threads outlive
 *     individual canvas snapshots.
 */
export const commentSchema = z.object({
  id: z.string(),
  /** If set, the comment is pinned to this element's top-right corner. */
  elementId: z.string().optional(),
  /** If set (and elementId is absent), the comment is pinned to this board point. */
  point: z.object({ x: z.number(), y: z.number() }).optional(),
  authorId: z.string(),
  authorName: z.string(),
  body: z.string(),
  resolved: z.boolean(),
  createdAt: z.number(),
  replies: z.array(commentReplySchema),
});
export type Comment = z.infer<typeof commentSchema>;
