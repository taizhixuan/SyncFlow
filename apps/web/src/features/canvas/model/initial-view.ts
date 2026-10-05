import type { CanvasElement } from '@syncflow/shared';
import type { View } from '../engine/viewport';
import { unionBounds } from './connector';
import { viewportForBounds } from './presentation';

/**
 * The view to open a board at, or null to keep the current one. Every board
 * opens at the origin, so a board drawn on a wide screen could open on a phone
 * with all of its content off to the side, looking empty. When nothing is on
 * screen, fit the content instead — but never zoom in past 100%.
 */
export function initialView(
  elements: CanvasElement[],
  view: View,
  stage: { width: number; height: number },
): View | null {
  if (!elements.length || stage.width <= 0 || stage.height <= 0) return null;
  const all = Object.fromEntries(elements.map((e) => [e.id, e]));
  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = left + stage.width / view.scale;
  const bottom = top + stage.height / view.scale;
  const visible = elements.some((el) => {
    const b = unionBounds([el], all);
    return !!b && b.x < right && b.x + b.width > left && b.y < bottom && b.y + b.height > top;
  });
  if (visible) return null;
  const bounds = unionBounds(elements, all);
  if (!bounds) return null;
  const fitted = viewportForBounds(bounds, stage);
  if (fitted.scale <= 1) return fitted;
  return {
    scale: 1,
    x: stage.width / 2 - (bounds.x + bounds.width / 2),
    y: stage.height / 2 - (bounds.y + bounds.height / 2),
  };
}
