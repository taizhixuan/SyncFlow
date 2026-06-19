import type { CanvasElement } from '@syncflow/shared';
import { getBounds } from './element';

/**
 * Returns the ids of non-frame elements whose bounds-center lies within
 * the frame's bounding box. Used to compute which elements move with the
 * frame during a drag.
 */
export function elementsInFrame(frame: CanvasElement, all: CanvasElement[]): string[] {
  const fb = getBounds(frame);
  return all
    .filter((el) => {
      if (el.id === frame.id) return false;
      if (el.type === 'frame') return false;
      const b = getBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      return cx >= fb.x && cx <= fb.x + fb.width && cy >= fb.y && cy <= fb.y + fb.height;
    })
    .map((el) => el.id);
}
