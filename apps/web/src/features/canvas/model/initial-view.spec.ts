import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { initialView } from './initial-view';

const STAGE = { width: 390, height: 600 };
const rect = (id: string, x: number, y: number, width = 100, height = 80): CanvasElement =>
  ({ id, type: 'rect', x, y, width, height, rotation: 0, opacity: 1, zIndex: 0 }) as CanvasElement;

describe('initialView', () => {
  it('leaves the view alone when something is already on screen', () => {
    expect(initialView([rect('a', 50, 50), rect('b', 2000, 0)], { x: 0, y: 0, scale: 1 }, STAGE)).toBeNull();
  });

  it('brings the content into view when none of it is on screen (a phone opening a desktop board)', () => {
    const els = [rect('a', 450, 150), rect('b', 1380, 400)];
    const v = initialView(els, { x: 0, y: 0, scale: 1 }, STAGE)!;
    expect(v).not.toBeNull();
    // Both ends of the content now fall inside the stage.
    const toScreen = (x: number): number => x * v.scale + v.x;
    expect(toScreen(450)).toBeGreaterThanOrEqual(0);
    expect(toScreen(1480)).toBeLessThanOrEqual(STAGE.width);
  });

  it('never zooms past 100% to frame a small board', () => {
    const v = initialView([rect('a', 900, 900, 40, 40)], { x: 0, y: 0, scale: 1 }, STAGE)!;
    expect(v.scale).toBe(1);
    // Centred on the element.
    expect(920 * v.scale + v.x).toBeCloseTo(STAGE.width / 2);
  });

  it('does nothing for an empty board or an unmeasured stage', () => {
    expect(initialView([], { x: 0, y: 0, scale: 1 }, STAGE)).toBeNull();
    expect(initialView([rect('a', 900, 900)], { x: 0, y: 0, scale: 1 }, { width: 0, height: 0 })).toBeNull();
  });
});
