/**
 * Position patches produced by a drag gesture.
 *
 * A drag can move more elements than the one under the pointer: a selection, a
 * frame and everything inside it, a mind node and its whole subtree. Those
 * followers used to be read back off their Konva nodes at drag end, which
 * quietly assumed every member of the set was mounted. Viewport culling breaks
 * that assumption — a frame is easily larger than the screen, so some of its
 * children have no node at all — and a follower without a node simply never
 * got a patch and stayed behind.
 *
 * Deriving every patch from a single delta instead makes the result depend only
 * on the document, so it is identical whether a follower is on screen or not.
 */

import type { Point } from '../engine/viewport';

/**
 * Move every id in `ids` by the delta the anchor actually travelled.
 *
 * `start` holds each element's position when the gesture began, `anchorId` is
 * the element under the pointer and `anchorPos` is where it ended up. Ids with
 * no recorded start are skipped, except the anchor itself, which falls back to
 * its final position so a drag still commits if the set was never captured.
 */
export function dragPatches(
  ids: readonly string[],
  start: ReadonlyMap<string, Point>,
  anchorId: string,
  anchorPos: Point,
): Record<string, Point> {
  const origin = start.get(anchorId);
  const dx = origin ? anchorPos.x - origin.x : 0;
  const dy = origin ? anchorPos.y - origin.y : 0;

  const patches: Record<string, Point> = {};
  for (const id of ids) {
    const from = start.get(id);
    if (from) patches[id] = { x: from.x + dx, y: from.y + dy };
    else if (id === anchorId) patches[id] = { x: anchorPos.x, y: anchorPos.y };
  }
  return patches;
}
