import type { CanvasElement } from '@syncflow/shared';
import { getBounds } from './element';
import type { View } from '../engine/viewport';

export function orderFrames(els: CanvasElement[]): CanvasElement[] {
  return els
    .filter((el) => el.type === 'frame')
    .slice()
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const DEFAULT_PADDING = 40;

/** Compute a centered, fitted viewport for an arbitrary box (frame or board bounds). */
export function viewportForBounds(
  b: { x: number; y: number; width: number; height: number },
  stage: { width: number; height: number },
  padding = DEFAULT_PADDING,
): View {
  const aw = stage.width - padding * 2;
  const ah = stage.height - padding * 2;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(aw / b.width, ah / b.height)));
  const x = stage.width / 2 - (b.x + b.width / 2) * scale;
  const y = stage.height / 2 - (b.y + b.height / 2) * scale;
  return { x, y, scale };
}

export function viewportForFrame(
  frame: CanvasElement,
  stage: { width: number; height: number },
  padding = DEFAULT_PADDING,
): View {
  return viewportForBounds(getBounds(frame), stage, padding);
}
