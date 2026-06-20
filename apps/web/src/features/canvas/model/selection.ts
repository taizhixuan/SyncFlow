import type { CanvasElement } from '@syncflow/shared';
import { getBounds, type Rect } from './element';
import { resolveConnector, type Point } from './connector';

export function selectionBounds(els: CanvasElement[]): Rect | null {
  if (els.length === 0) return null;
  const bs = els.map(getBounds);
  const minX = Math.min(...bs.map((b) => b.x));
  const minY = Math.min(...bs.map((b) => b.y));
  const maxX = Math.max(...bs.map((b) => b.x + b.width));
  const maxY = Math.max(...bs.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function elementsInMarquee(els: CanvasElement[], marquee: Rect): string[] {
  return els.filter((el) => intersects(getBounds(el), marquee)).map((el) => el.id);
}

function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Sign of the cross product (a→b) × (a→c); >0 left, <0 right, 0 collinear. */
function ccw(a: Point, b: Point, c: Point): number {
  return (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
}

/** Do open segments p1p2 and p3p4 properly cross? (collinear-overlap ignored). */
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** A segment touches a rect if an endpoint is inside or it crosses any edge. */
function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  const tl = { x: r.x, y: r.y };
  const tr = { x: r.x + r.width, y: r.y };
  const br = { x: r.x + r.width, y: r.y + r.height };
  const bl = { x: r.x, y: r.y + r.height };
  return (
    segmentsCross(a, b, tl, tr) ||
    segmentsCross(a, b, tr, br) ||
    segmentsCross(a, b, br, bl) ||
    segmentsCross(a, b, bl, tl)
  );
}

/**
 * Connectors/arrows have no width/height bounds (they ride their endpoints), so
 * the box-based marquee misses them. Select a connector when its resolved
 * segment actually touches the marquee — a true segment test, so a diagonal
 * arrow isn't grabbed just because its bounding box overlaps the box.
 */
export function connectorsInMarquee(
  connectors: CanvasElement[],
  elements: Record<string, CanvasElement>,
  marquee: Rect,
): string[] {
  return connectors
    .filter((c) => {
      const { from, to } = resolveConnector(c, elements);
      return segmentIntersectsRect(from, to, marquee);
    })
    .map((c) => c.id);
}

/** Normalize two drag points (in any order) into a positive-size selection rect. */
export function marqueeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Fold marquee hits into the selection. Shift-drag is additive (union with the
 * base, de-duplicated, order-stable); a plain drag replaces the selection.
 */
export function mergeMarquee(base: string[], hits: string[], additive: boolean): string[] {
  if (!additive) return hits;
  const seen = new Set(base);
  const merged = [...base];
  for (const id of hits) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}
