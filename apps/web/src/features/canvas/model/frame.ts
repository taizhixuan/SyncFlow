import type { CanvasElement } from '@syncflow/shared';
import { getBounds } from './element';
import { expandToGroups } from './group';

/**
 * Ids of the elements that move with `frame` when it is dragged: every
 * non-frame element whose bounds-center lies inside the frame, grown to whole
 * groups (a group straddling the frame edge must not be torn apart), minus
 * locked elements, which nothing but the user unlocking them may move.
 */
export function elementsInFrame(frame: CanvasElement, all: CanvasElement[]): string[] {
  const fb = getBounds(frame);
  const inside = all
    .filter((el) => {
      if (el.id === frame.id) return false;
      if (el.type === 'frame') return false;
      const b = getBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      return cx >= fb.x && cx <= fb.x + fb.width && cy >= fb.y && cy <= fb.y + fb.height;
    })
    .map((el) => el.id);
  const byId = Object.fromEntries(all.map((el) => [el.id, el]));
  return expandToGroups(inside, byId).filter((id) => id !== frame.id && !byId[id]?.locked);
}
