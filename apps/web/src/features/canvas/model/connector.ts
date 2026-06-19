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

/** Resolve a connector's two endpoints from its element bindings / explicit coords. */
export function resolveConnector(
  conn: CanvasElement,
  elements: Record<string, CanvasElement>,
): { from: Point; to: Point } {
  const fromEl = conn.from?.elementId ? elements[conn.from.elementId] : undefined;
  const toEl = conn.to?.elementId ? elements[conn.to.elementId] : undefined;
  const fromBox = fromEl ? getBounds(fromEl) : null;
  const toBox = toEl ? getBounds(toEl) : null;

  const fromAnchor: Point = fromBox
    ? center(fromBox)
    : { x: conn.from?.x ?? 0, y: conn.from?.y ?? 0 };
  const toAnchor: Point = toBox ? center(toBox) : { x: conn.to?.x ?? 0, y: conn.to?.y ?? 0 };

  return {
    from: fromBox ? edgePoint(fromBox, toAnchor) : fromAnchor,
    to: toBox ? edgePoint(toBox, fromAnchor) : toAnchor,
  };
}
