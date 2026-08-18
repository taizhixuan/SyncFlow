export interface View {
  x: number;
  y: number;
  scale: number;
}

export function screenToCanvas(view: View, p: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

export function zoomAtPoint(
  view: View,
  screenPoint: { x: number; y: number },
  factor: number,
  min = 0.2,
  max = 4,
): View {
  const scale = Math.min(max, Math.max(min, view.scale * factor));
  const anchor = screenToCanvas(view, screenPoint);
  return { scale, x: screenPoint.x - anchor.x * scale, y: screenPoint.y - anchor.y * scale };
}

export interface Point {
  x: number;
  y: number;
}

/** Subset of WheelEvent we act on — keeps the math testable without a DOM. */
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** Firefox reports wheel deltas in lines (deltaMode 1) or pages (2), not pixels. */
const LINE_PX = 16;
const PAGE_PX = 400;
/** Caps a single event's zoom so one hard mouse-wheel flick can't jump the whole range. */
const ZOOM_DELTA_CAP = 50;
const ZOOM_RATE = 250;

function toPixels(delta: number, mode: number | undefined): number {
  if (mode === 1) return delta * LINE_PX;
  if (mode === 2) return delta * PAGE_PX;
  return delta;
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/**
 * Excalidraw-style wheel semantics: scroll pans, shift+scroll pans sideways,
 * ctrl/meta+scroll zooms at the cursor. Browsers report a trackpad pinch as a
 * wheel event with `ctrlKey` set, so pinch-to-zoom falls out of the same branch.
 */
export function wheelStep(view: View, e: WheelLike, pointer: Point): View {
  const dx = toPixels(e.deltaX, e.deltaMode);
  const dy = toPixels(e.deltaY, e.deltaMode);
  if (e.ctrlKey || e.metaKey) {
    const capped = Math.max(-ZOOM_DELTA_CAP, Math.min(ZOOM_DELTA_CAP, dy));
    return zoomAtPoint(view, pointer, Math.exp(-capped / ZOOM_RATE));
  }
  // Chrome already swaps the axes for shift+wheel; fall back to deltaY when it doesn't.
  if (e.shiftKey) return panBy(view, -(dx || dy), 0);
  return panBy(view, -dx, -dy);
}

/**
 * One frame of a two-finger gesture: zoom by how much the fingers spread,
 * anchored at their midpoint, then follow wherever that midpoint travelled —
 * so a single gesture pinches and pans at once.
 */
export function pinchStep(view: View, prev: readonly [Point, Point], next: readonly [Point, Point]): View {
  const spread = (p: readonly [Point, Point]): number => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
  const middle = (p: readonly [Point, Point]): Point => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
  const before = spread(prev);
  const factor = before > 0 ? spread(next) / before : 1;
  const from = middle(prev);
  const to = middle(next);
  return panBy(zoomAtPoint(view, from, factor), to.x - from.x, to.y - from.y);
}
