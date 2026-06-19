import type Konva from 'konva';
import type { CanvasElement } from '@syncflow/shared';
import { getBounds } from './element';

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Compute the union bounding box of a set of canvas elements.
 * Returns null if the array is empty.
 */
export function selectionBbox(
  els: CanvasElement[],
): { x: number; y: number; width: number; height: number } | null {
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
 * Export the entire visible stage as a PNG at 2× pixel ratio.
 */
export function exportBoardPng(stage: Konva.Stage): void {
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  triggerDownload(dataUrl, 'board.png');
}

/**
 * Export only the bounding box of the given elements as a PNG.
 * No-ops if `els` is empty.
 */
export function exportSelectionPng(stage: Konva.Stage, els: CanvasElement[]): void {
  const bbox = selectionBbox(els);
  if (!bbox) return;
  const dataUrl = stage.toDataURL({
    pixelRatio: 2,
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
  });
  triggerDownload(dataUrl, 'selection.png');
}
