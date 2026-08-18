/**
 * Viewport culling for the element layer.
 *
 * An infinite canvas keeps every element in the document, but only the ones
 * intersecting the viewport can affect a frame. Konva has no scene-graph
 * culling of its own: each shape costs a path build, a fill, a stroke and — for
 * anything with a label — a full text layout on every redraw, whether or not it
 * lands inside the canvas. Skipping the ones that cannot be seen is the single
 * biggest lever on a large board.
 *
 * Purely a rendering concern. The document, hit-testing geometry, marquee
 * selection and export all read the full element list, so culling can never
 * change what the board *is* — only what is mounted right now.
 */

import type { CanvasElement } from '@syncflow/shared';

import type { View } from '../engine/viewport';
import { getBounds, type Rect } from './element';

/**
 * How far beyond the viewport edge elements stay mounted, in screen pixels.
 *
 * Mounting and unmounting a Konva node is more expensive than drawing one, so
 * culling exactly at the edge would trade draw cost for churn during a pan. The
 * margin means a normal drag-pan mostly moves through already-mounted elements.
 */
export const CULL_MARGIN = 320;

/**
 * Element count below which culling is not worth doing.
 *
 * The filter is O(n) per view change, and on a small board it can only ever
 * save a handful of draws while still paying the mount/unmount churn.
 */
export const CULL_MIN_ELEMENTS = 120;

/** The visible region in canvas coordinates, grown by `margin` screen pixels. */
export function viewportBounds(
  view: View,
  size: { width: number; height: number },
  margin = CULL_MARGIN,
): Rect {
  const scale = Number.isFinite(view.scale) && view.scale > 0 ? view.scale : 1;
  // The margin is authored in screen pixels so it stays a constant visual
  // distance; dividing converts it into the canvas units bounds are measured in.
  const m = margin / scale;
  return {
    x: -view.x / scale - m,
    y: -view.y / scale - m,
    width: size.width / scale + m * 2,
    height: size.height / scale + m * 2,
  };
}

/** Whether two axis-aligned rectangles overlap. Touching edges count. */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/**
 * The elements worth mounting for this viewport.
 *
 * `keep` is mounted regardless of position — selected elements need their live
 * Konva node for the Transformer to attach to, and anything mid-gesture needs
 * one to be moved. Returns the input array unchanged when nothing was culled so
 * referential equality (and therefore React's memo) survives.
 */
export function cullElements(
  elements: readonly CanvasElement[],
  viewport: Rect,
  keep: ReadonlySet<string>,
): readonly CanvasElement[] {
  if (elements.length < CULL_MIN_ELEMENTS) return elements;
  const visible = elements.filter(
    (el) => keep.has(el.id) || intersects(getBounds(el), viewport),
  );
  return visible.length === elements.length ? elements : visible;
}
