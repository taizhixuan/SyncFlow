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

import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import type { Point } from '../engine/viewport';

type Endpoint = CanvasElement['from'];

/** A fixed end moved by (dx, dy); a bound end stays bound and follows its element. */
function shiftFreeEnd(end: Endpoint, dx: number, dy: number): Endpoint {
  if (!end || end.elementId !== undefined) return end;
  return {
    ...end,
    ...(typeof end.x === 'number' ? { x: end.x + dx } : {}),
    ...(typeof end.y === 'number' ? { y: end.y + dy } : {}),
  };
}

/**
 * The patch that moves one element by (dx, dy). Connectors are drawn from their
 * end points, not x/y, so a patch of x/y alone left a free arrow behind when
 * it was nudged or carried along by a frame, group or multi-selection drag.
 */
export function translatePatch(el: CanvasElement, dx: number, dy: number): CanvasElementPatch {
  const patch: CanvasElementPatch = { x: el.x + dx, y: el.y + dy };
  if (el.type !== 'connector') return patch;
  if (el.from !== undefined) patch.from = shiftFreeEnd(el.from, dx, dy);
  if (el.to !== undefined) patch.to = shiftFreeEnd(el.to, dx, dy);
  return patch;
}

/**
 * Move every id in `ids` by the delta the anchor actually travelled.
 *
 * `start` holds each element's position when the gesture began, `anchorId` is
 * the element under the pointer and `anchorPos` is where it ended up. Ids with
 * no recorded start are skipped, except the anchor itself, which falls back to
 * its final position so a drag still commits if the set was never captured.
 *
 * Given the document's `elements`, followers move through translatePatch (so
 * free arrows come along) and locked followers stay put.
 */
export function dragPatches(
  ids: readonly string[],
  start: ReadonlyMap<string, Point>,
  anchorId: string,
  anchorPos: Point,
  elements?: Readonly<Record<string, CanvasElement>>,
): Record<string, CanvasElementPatch> {
  const origin = start.get(anchorId);
  const dx = origin ? anchorPos.x - origin.x : 0;
  const dy = origin ? anchorPos.y - origin.y : 0;

  const patches: Record<string, CanvasElementPatch> = {};
  for (const id of ids) {
    const from = start.get(id);
    const el = elements?.[id];
    if (id !== anchorId && el?.locked) continue;
    if (from && el?.type === 'connector') patches[id] = translatePatch(el, dx, dy);
    else if (from) patches[id] = { x: from.x + dx, y: from.y + dy };
    else if (id === anchorId) patches[id] = { x: anchorPos.x, y: anchorPos.y };
  }
  return patches;
}
