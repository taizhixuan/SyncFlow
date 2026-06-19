import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import { getBounds } from './element';

/** Uniform gap between elements when arranging in a row or column (px). */
export const ARRANGE_GAP = 32;

type Patches = Record<string, CanvasElementPatch>;

/**
 * Repacks a selection into a tidy row (left → right).
 *
 * - Sort elements by their current x position.
 * - Start at the minimum x of the selection.
 * - Each subsequent element's x = previous.x + previous.width + gap.
 * - All elements are aligned to a common y = min y of the selection.
 * - Single element or empty array → returns {} (no-op).
 */
export function arrangeRow(els: CanvasElement[], gap = ARRANGE_GAP): Patches {
  if (els.length < 2) return {};

  const withBounds = els.map((el) => ({ el, b: getBounds(el) }));
  const minX = Math.min(...withBounds.map(({ b }) => b.x));
  const minY = Math.min(...withBounds.map(({ b }) => b.y));

  // Sort by current x position
  const sorted = [...withBounds].sort((a, b) => a.b.x - b.b.x);

  const patches: Patches = {};
  let cursor = minX;
  for (const { el, b } of sorted) {
    // Compute the delta needed so that the element's left edge lands at cursor.
    const deltaX = cursor - b.x;
    const deltaY = minY - b.y;
    patches[el.id] = { x: el.x + deltaX, y: el.y + deltaY };
    cursor += b.width + gap;
  }
  return patches;
}

/**
 * Repacks a selection into a tidy column (top → bottom).
 *
 * - Sort elements by their current y position.
 * - Start at the minimum y of the selection.
 * - Each subsequent element's y = previous.y + previous.height + gap.
 * - All elements are aligned to a common x = min x of the selection.
 * - Single element or empty array → returns {} (no-op).
 */
export function arrangeColumn(els: CanvasElement[], gap = ARRANGE_GAP): Patches {
  if (els.length < 2) return {};

  const withBounds = els.map((el) => ({ el, b: getBounds(el) }));
  const minX = Math.min(...withBounds.map(({ b }) => b.x));
  const minY = Math.min(...withBounds.map(({ b }) => b.y));

  // Sort by current y position
  const sorted = [...withBounds].sort((a, b) => a.b.y - b.b.y);

  const patches: Patches = {};
  let cursor = minY;
  for (const { el, b } of sorted) {
    const deltaX = minX - b.x;
    const deltaY = cursor - b.y;
    patches[el.id] = { x: el.x + deltaX, y: el.y + deltaY };
    cursor += b.height + gap;
  }
  return patches;
}
