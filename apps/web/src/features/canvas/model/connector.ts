import type { CanvasElement } from '@syncflow/shared';
import { getBounds, type Rect } from './element';

export interface Point {
  x: number;
  y: number;
}

/** Point where the ray from the box center toward `toward` crosses the box edge. */
export function edgePoint(box: Rect, toward: Point): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = box.width / 2;
  const hh = box.height / 2;
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function center(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

type Endpoint = CanvasElement['from'];

/** A fixed point stored on the endpoint, if it has one. */
function storedPoint(end: Endpoint): Point | null {
  return end && typeof end.x === 'number' && typeof end.y === 'number' ? { x: end.x, y: end.y } : null;
}

/**
 * Resolve a connector's two endpoints from its element bindings / explicit coords.
 *
 * A binding whose element is gone (a peer deleted it, or the delete predates
 * the detach-on-delete in removeElements) falls back to the last-known point
 * stored with it, and failing that collapses onto the other end. Defaulting to
 * (0, 0) drew a stray arrow from the shape to the board origin.
 */
export function resolveConnector(
  conn: CanvasElement,
  elements: Record<string, CanvasElement>,
): { from: Point; to: Point } {
  const fromEl = conn.from?.elementId ? elements[conn.from.elementId] : undefined;
  const toEl = conn.to?.elementId ? elements[conn.to.elementId] : undefined;
  const fromBox = fromEl ? getBounds(fromEl) : null;
  const toBox = toEl ? getBounds(toEl) : null;

  const fromKnown = fromBox ? center(fromBox) : storedPoint(conn.from);
  const toKnown = toBox ? center(toBox) : storedPoint(conn.to);
  const fallback = { x: conn.x, y: conn.y };
  const fromAnchor = fromKnown ?? toKnown ?? fallback;
  const toAnchor = toKnown ?? fromKnown ?? fallback;

  return {
    from: fromBox ? edgePoint(fromBox, toAnchor) : fromAnchor,
    to: toBox ? edgePoint(toBox, fromAnchor) : toAnchor,
  };
}

/**
 * The same connector with every binding to an element in `gone` replaced by
 * the fixed point it is drawn at now. Returns the input unchanged when no
 * binding is affected.
 */
export function detachConnector(
  conn: CanvasElement,
  gone: ReadonlySet<string>,
  elements: Record<string, CanvasElement>,
): CanvasElement {
  const fromGone = !!conn.from?.elementId && gone.has(conn.from.elementId);
  const toGone = !!conn.to?.elementId && gone.has(conn.to.elementId);
  if (!fromGone && !toGone) return conn;
  const { from, to } = resolveConnector(conn, elements);
  return {
    ...conn,
    ...(fromGone ? { from: { x: from.x, y: from.y } } : {}),
    ...(toGone ? { to: { x: to.x, y: to.y } } : {}),
  };
}

/**
 * Bounds of any element, resolving connector endpoints against `elements`.
 * A connector is otherwise a zero box at (0, 0), which dragged minimap bounds,
 * fit-to-board and whole-board export back to the origin.
 */
export function elementBounds(el: CanvasElement, elements: Record<string, CanvasElement>): Rect {
  if (el.type !== 'connector') return getBounds(el);
  const { from, to } = resolveConnector(el, elements);
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  return { x, y, width: Math.abs(from.x - to.x), height: Math.abs(from.y - to.y) };
}

/** Union bounds of `els`; connectors resolve against `all` (defaults to `els`). */
export function unionBounds(
  els: readonly CanvasElement[],
  all?: Record<string, CanvasElement>,
): Rect | null {
  if (els.length === 0) return null;
  const dict = all ?? Object.fromEntries(els.map((e) => [e.id, e]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    const b = elementBounds(el, dict);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
