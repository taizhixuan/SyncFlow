import type { CanvasElement } from '@syncflow/shared';
import { getBounds, type Rect } from './element';

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
