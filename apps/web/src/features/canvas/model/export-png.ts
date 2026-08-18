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

/** Resolution multipliers offered in the export menu. */
export const EXPORT_MULTIPLIERS = [1, 2, 3, 4] as const;
export type ExportMultiplier = (typeof EXPORT_MULTIPLIERS)[number];

/**
 * Longest side and total area a browser will allocate for a canvas. Exceed
 * either and `toDataURL` hands back a blank or truncated image rather than
 * throwing, so the request has to be clamped before it is made.
 */
const MAX_EXPORT_SIDE = 16_384;
const MAX_EXPORT_AREA = 134_217_728; // 16384 x 8192

export interface ExportScale {
  /** Value to pass Konva as `pixelRatio`. */
  pixelRatio: number;
  /** Multiplier actually achieved, after clamping to browser canvas limits. */
  effectiveMultiplier: number;
  /** True when the requested multiplier had to be reduced to fit. */
  clamped: boolean;
}

/**
 * Turn a requested resolution multiplier into a Konva `pixelRatio`.
 *
 * Konva re-renders the scene for an export rather than upscaling the visible
 * canvas — but it renders it through the node transform, which carries the
 * current zoom. So a naive `pixelRatio: 2` yields an effective scale of
 * `zoom * 2`: soft at 25% zoom, enormous at 400%. Dividing the zoom back out
 * pins the output to exactly `multiplier` device pixels per board unit, making
 * export resolution independent of what the user happens to be zoomed to.
 *
 * `board` is the export region in BOARD units, used only to clamp.
 */
export function resolveExportScale(
  multiplier: number,
  zoom: number,
  board: { width: number; height: number },
): ExportScale {
  const requested = Math.max(1, multiplier);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const w = Math.max(1, board.width);
  const h = Math.max(1, board.height);

  const bySide = Math.min(MAX_EXPORT_SIDE / w, MAX_EXPORT_SIDE / h);
  const byArea = Math.sqrt(MAX_EXPORT_AREA / (w * h));
  const effectiveMultiplier = Math.max(0.1, Math.min(requested, bySide, byArea));

  return {
    pixelRatio: effectiveMultiplier / safeZoom,
    effectiveMultiplier,
    clamped: effectiveMultiplier < requested,
  };
}

/**
 * PNG data URL of the WHOLE board — the union bounds of all elements, so
 * content panned off-screen is still captured. Falls back to the visible stage
 * when the board is empty.
 *
 * `multiplier` is device pixels per board unit and is honoured regardless of
 * the current zoom (see resolveExportScale).
 */
export function boardPngDataUrl(
  stage: Konva.Stage,
  els: CanvasElement[],
  view: View,
  multiplier = 2,
): string {
  const bbox = selectionBbox(els);
  if (!bbox) {
    // Empty board: the region is the viewport itself, so the zoom transform is
    // part of what we are capturing and must NOT be divided out.
    const { pixelRatio } = resolveExportScale(multiplier, 1, {
      width: stage.width(),
      height: stage.height(),
    });
    return stage.toDataURL({ pixelRatio });
  }
  const screen = canvasRectToScreen(bbox, view);
  const { pixelRatio } = resolveExportScale(multiplier, view.scale, bbox);
  return stage.toDataURL({
    pixelRatio,
    x: screen.x,
    y: screen.y,
    width: Math.max(1, screen.width),
    height: Math.max(1, screen.height),
  });
}

/**
 * PNG data URL of the given elements' bounding box, or null if the set is
 * empty. `view` converts the canvas-world bbox to the screen-space coordinates
 * Konva's toDataURL expects; `multiplier` sets the output resolution
 * independently of the current zoom.
 */
export function selectionPngDataUrl(
  stage: Konva.Stage,
  els: CanvasElement[],
  view: View,
  multiplier = 2,
): string | null {
  const bbox = selectionBbox(els);
  if (!bbox) return null;
  const screen = canvasRectToScreen(bbox, view);
  const { pixelRatio } = resolveExportScale(multiplier, view.scale, bbox);
  return stage.toDataURL({
    pixelRatio,
    x: screen.x,
    y: screen.y,
    width: Math.max(1, screen.width),
    height: Math.max(1, screen.height),
  });
}
