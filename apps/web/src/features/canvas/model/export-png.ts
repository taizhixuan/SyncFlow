import type Konva from 'konva';
import type { CanvasElement } from '@syncflow/shared';
import { getBounds } from './element';
import type { View } from '../engine/viewport';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the union bounding box of a set of canvas elements.
 * Returns null if the array is empty.
 */
export function selectionBbox(els: CanvasElement[]): Rect | null {
  if (els.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of els) {
    const b = getBounds(el);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    const ex = b.x + b.width;
    const ey = b.y + b.height;
    if (ex > maxX) maxX = ex;
    if (ey > maxY) maxY = ey;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Convert a rectangle in canvas-world coordinates to screen-space pixel
 * coordinates relative to the Konva stage, applying the current viewport
 * transform (pan + zoom).
 *
 * Mirrors the conversion used by the slide-PDF path in export-menu.tsx:
 *   screenX = canvasX * scale + panX
 *   screenY = canvasY * scale + panY
 *   screenW = canvasW * scale
 *   screenH = canvasH * scale
 */
export function canvasRectToScreen(rect: Rect, view: View): Rect {
  return {
    x: rect.x * view.scale + view.x,
    y: rect.y * view.scale + view.y,
    width: rect.width * view.scale,
    height: rect.height * view.scale,
  };
}

/**
 * PNG data URL (2× pixel ratio) of the WHOLE board — the union bounds of all
 * elements, so content panned off-screen is still captured. Falls back to the
 * visible stage when the board is empty.
 */
export function boardPngDataUrl(stage: Konva.Stage, els: CanvasElement[], view: View): string {
  const bbox = selectionBbox(els);
  if (!bbox) return stage.toDataURL({ pixelRatio: 2 });
  const screen = canvasRectToScreen(bbox, view);
  return stage.toDataURL({
    pixelRatio: 2,
    x: screen.x,
    y: screen.y,
    width: Math.max(1, screen.width),
    height: Math.max(1, screen.height),
  });
}

/**
 * PNG data URL (2× pixel ratio) of the given elements' bounding box, or null if
 * the set is empty. `view` converts the canvas-world bbox to the screen-space
 * coordinates Konva's toDataURL expects.
 */
export function selectionPngDataUrl(stage: Konva.Stage, els: CanvasElement[], view: View): string | null {
  const bbox = selectionBbox(els);
  if (!bbox) return null;
  const screen = canvasRectToScreen(bbox, view);
  return stage.toDataURL({
    pixelRatio: 2,
    x: screen.x,
    y: screen.y,
    width: Math.max(1, screen.width),
    height: Math.max(1, screen.height),
  });
}
