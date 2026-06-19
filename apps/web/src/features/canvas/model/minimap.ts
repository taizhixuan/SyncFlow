/**
 * Pure transform helpers for the minimap overview panel.
 *
 * The minimap shows a bird's-eye view of the whole board. It:
 *   1. Computes a bounding box covering all elements (boardBounds).
 *   2. Derives a scale+offset that fits those bounds into the minimap widget
 *      with padding (fitTransform).
 *   3. Projects the current viewport into minimap coords (viewportRectInMini).
 *   4. Inverts a minimap click back to board coords for click-to-pan
 *      (miniPointToBoard).
 *
 * No React, no Yjs, no side-effects — purely referentially-transparent math.
 */

import type { CanvasElement } from '@syncflow/shared';
import type { View } from '../engine/viewport';
import { getBounds } from './element';
import type { Rect } from './element';

// ── Public types ──────────────────────────────────────────────────────────────

/** The linear transform that maps board coordinates → minimap pixel coords:
 *   miniX = boardX * scale + offsetX
 *   miniY = boardY * scale + offsetY
 */
export interface MiniTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// ── boardBounds ───────────────────────────────────────────────────────────────

/** Default board extent used when there are no elements. */
const DEFAULT_BOUNDS: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

/**
 * Returns the axis-aligned bounding box that covers all element bounds.
 * Falls back to DEFAULT_BOUNDS when the element list is empty so the
 * minimap always has a sensible shape.
 */
export function boardBounds(els: CanvasElement[]): Rect {
  if (els.length === 0) return { ...DEFAULT_BOUNDS };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of els) {
    const b = getBounds(el);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    const right = b.x + b.width;
    const bottom = b.y + b.height;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ── fitTransform ──────────────────────────────────────────────────────────────

/**
 * Computes the MiniTransform that fits `bounds` into the minimap widget area
 * (size `mini`) with uniform `pad` pixels of padding on all sides.
 *
 * Aspect ratio is always preserved; the content is centered in whichever
 * dimension is not scale-limited.
 */
export function fitTransform(
  bounds: Rect,
  mini: { width: number; height: number },
  pad = 8,
): MiniTransform {
  const usableW = mini.width - 2 * pad;
  const usableH = mini.height - 2 * pad;

  // Guard against degenerate bounds (zero-size element, etc.).
  const bW = bounds.width > 0 ? bounds.width : 1;
  const bH = bounds.height > 0 ? bounds.height : 1;

  const scale = Math.min(usableW / bW, usableH / bH);

  // Center the content in the usable area.
  const renderedW = bW * scale;
  const renderedH = bH * scale;
  const offsetX = pad + (usableW - renderedW) / 2 - bounds.x * scale;
  const offsetY = pad + (usableH - renderedH) / 2 - bounds.y * scale;

  return { scale, offsetX, offsetY };
}

// ── viewportRectInMini ────────────────────────────────────────────────────────

/**
 * Computes the rectangle in minimap pixel coords that represents the current
 * viewport (the "you are here" box).
 *
 * The viewport transform is:
 *   screenX = boardX * view.scale + view.x  →  boardX = (screenX - view.x) / view.scale
 *
 * So the canvas corners visible on screen are:
 *   TL = (0 - view.x) / view.scale = (-view.x / view.scale,  -view.y / view.scale)
 *   BR = ((stageW - view.x) / view.scale, (stageH - view.y) / view.scale)
 */
export function viewportRectInMini(
  view: View,
  stage: { width: number; height: number },
  t: MiniTransform,
): Rect {
  const canvasX = -view.x / view.scale;
  const canvasY = -view.y / view.scale;
  const canvasW = stage.width / view.scale;
  const canvasH = stage.height / view.scale;

  return {
    x: canvasX * t.scale + t.offsetX,
    y: canvasY * t.scale + t.offsetY,
    width: canvasW * t.scale,
    height: canvasH * t.scale,
  };
}

// ── miniPointToBoard ──────────────────────────────────────────────────────────

/**
 * Inverse of the forward minimap transform.
 *
 * Forward:  miniX = boardX * t.scale + t.offsetX
 * Inverse:  boardX = (miniX - t.offsetX) / t.scale
 */
export function miniPointToBoard(
  point: { x: number; y: number },
  t: MiniTransform,
): { x: number; y: number } {
  return {
    x: (point.x - t.offsetX) / t.scale,
    y: (point.y - t.offsetY) / t.scale,
  };
}
