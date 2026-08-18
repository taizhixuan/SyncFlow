import { describe, expect, it } from 'vitest';
import { panBy, pinchStep, screenToCanvas, wheelStep, zoomAtPoint } from './viewport';

describe('viewport', () => {
  it('converts screen to canvas coords under pan+zoom', () => {
    expect(screenToCanvas({ x: 100, y: 50, scale: 2 }, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
  });
  it('keeps the zoom anchor point stationary', () => {
    const v = zoomAtPoint({ x: 0, y: 0, scale: 1 }, { x: 200, y: 200 }, 2);
    expect(v.scale).toBe(2);
    expect(screenToCanvas(v, { x: 200, y: 200 })).toEqual(
      screenToCanvas({ x: 0, y: 0, scale: 1 }, { x: 200, y: 200 }),
    );
  });
  it('clamps scale to [min,max]', () => {
    expect(zoomAtPoint({ x: 0, y: 0, scale: 4 }, { x: 0, y: 0 }, 2, 0.2, 4).scale).toBe(4);
  });
});

describe('panBy', () => {
  it('translates the camera without touching the scale', () => {
    expect(panBy({ x: 10, y: 20, scale: 2 }, 5, -8)).toEqual({ x: 15, y: 12, scale: 2 });
  });
});

describe('wheelStep', () => {
  const view = { x: 0, y: 0, scale: 1 };
  const pointer = { x: 200, y: 100 };

  it('pans the board on a plain scroll instead of zooming', () => {
    const next = wheelStep(view, { deltaX: 30, deltaY: 50, deltaMode: 0 }, pointer);
    expect(next).toEqual({ x: -30, y: -50, scale: 1 });
  });

  it('pans horizontally when shift is held', () => {
    const next = wheelStep(view, { deltaX: 0, deltaY: 50, deltaMode: 0, shiftKey: true }, pointer);
    expect(next).toEqual({ x: -50, y: 0, scale: 1 });
  });

  it('zooms at the pointer when ctrl is held (trackpad pinch)', () => {
    const next = wheelStep(view, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true }, pointer);
    expect(next.scale).toBeGreaterThan(1);
    // The point under the cursor must not drift while zooming.
    expect(screenToCanvas(next, pointer)).toEqual(screenToCanvas(view, pointer));
  });

  it('zooms out on a downward ctrl+scroll', () => {
    expect(wheelStep(view, { deltaX: 0, deltaY: 100, deltaMode: 0, metaKey: true }, pointer).scale).toBeLessThan(1);
  });

  it('scales line-mode deltas to pixels so firefox pans at the same speed', () => {
    const lines = wheelStep(view, { deltaX: 0, deltaY: 3, deltaMode: 1 }, pointer);
    const pixels = wheelStep(view, { deltaX: 0, deltaY: 48, deltaMode: 0 }, pointer);
    expect(lines).toEqual(pixels);
  });
});

describe('pinchStep', () => {
  const view = { x: 0, y: 0, scale: 1 };

  it('zooms by the ratio between finger distances', () => {
    const next = pinchStep(
      view,
      [{ x: 100, y: 100 }, { x: 200, y: 100 }],
      [{ x: 50, y: 100 }, { x: 250, y: 100 }],
    );
    expect(next.scale).toBeCloseTo(2);
  });

  it('keeps the finger midpoint anchored while pinching', () => {
    const prev: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
    ];
    const next = pinchStep(view, prev, [{ x: 80, y: 80 }, { x: 220, y: 220 }]);
    const mid = { x: 150, y: 150 };
    expect(screenToCanvas(next, mid).x).toBeCloseTo(screenToCanvas(view, mid).x);
    expect(screenToCanvas(next, mid).y).toBeCloseTo(screenToCanvas(view, mid).y);
  });

  it('pans when both fingers move together without changing distance', () => {
    const next = pinchStep(
      view,
      [{ x: 100, y: 100 }, { x: 200, y: 100 }],
      [{ x: 140, y: 130 }, { x: 240, y: 130 }],
    );
    expect(next.scale).toBeCloseTo(1);
    expect(next.x).toBeCloseTo(40);
    expect(next.y).toBeCloseTo(30);
  });
});
