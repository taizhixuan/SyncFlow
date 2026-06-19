import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { orderFrames, viewportForFrame } from './presentation';

function makeEl(overrides: Partial<CanvasElement> & { id: string; type: CanvasElement['type'] }): CanvasElement {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 1,
    strokeStyle: 'solid',
    ...overrides,
  };
}

describe('orderFrames', () => {
  it('returns only frame elements', () => {
    const rect = makeEl({ id: 'r1', type: 'rect', x: 0, y: 0 });
    const frame = makeEl({ id: 'f1', type: 'frame', x: 0, y: 0, width: 400, height: 300 });
    expect(orderFrames([rect, frame])).toEqual([frame]);
  });

  it('returns empty array when no frames present', () => {
    const rect = makeEl({ id: 'r1', type: 'rect' });
    expect(orderFrames([rect])).toEqual([]);
  });

  it('sorts frames top-to-bottom (by y) then left-to-right (by x)', () => {
    const f1 = makeEl({ id: 'f1', type: 'frame', x: 200, y: 100, width: 400, height: 300 });
    const f2 = makeEl({ id: 'f2', type: 'frame', x: 100, y: 200, width: 400, height: 300 });
    const f3 = makeEl({ id: 'f3', type: 'frame', x: 50, y: 100, width: 400, height: 300 });
    // f3 (y=100,x=50), f1 (y=100,x=200), f2 (y=200,x=100)
    expect(orderFrames([f1, f2, f3]).map((f) => f.id)).toEqual(['f3', 'f1', 'f2']);
  });

  it('handles same y by sorting left-to-right (x ascending)', () => {
    const fa = makeEl({ id: 'fa', type: 'frame', x: 500, y: 0, width: 200, height: 150 });
    const fb = makeEl({ id: 'fb', type: 'frame', x: 100, y: 0, width: 200, height: 150 });
    expect(orderFrames([fa, fb]).map((f) => f.id)).toEqual(['fb', 'fa']);
  });

  it('does not mutate the input array', () => {
    const frames = [
      makeEl({ id: 'f1', type: 'frame', x: 200, y: 0, width: 100, height: 100 }),
      makeEl({ id: 'f2', type: 'frame', x: 0, y: 0, width: 100, height: 100 }),
    ];
    const copy = [...frames];
    orderFrames(frames);
    expect(frames).toEqual(copy);
  });
});

describe('viewportForFrame', () => {
  const stage = { width: 1200, height: 800 };

  it('centers the frame within the stage', () => {
    const frame = makeEl({ id: 'f1', type: 'frame', x: 0, y: 0, width: 400, height: 300 });
    const view = viewportForFrame(frame, stage);
    // Frame center in canvas coords: (200, 150)
    // After transform: screen = canvas * scale + pan
    // Stage center = (600, 400)
    // So: 200 * scale + view.x ≈ 600  and  150 * scale + view.y ≈ 400
    const frameCenterX = (frame.x + (frame.width ?? 0) / 2) * view.scale + view.x;
    const frameCenterY = (frame.y + (frame.height ?? 0) / 2) * view.scale + view.y;
    expect(frameCenterX).toBeCloseTo(stage.width / 2, 1);
    expect(frameCenterY).toBeCloseTo(stage.height / 2, 1);
  });

  it('fits the frame within the stage minus padding', () => {
    const padding = 40;
    const frame = makeEl({ id: 'f1', type: 'frame', x: 0, y: 0, width: 400, height: 300 });
    const view = viewportForFrame(frame, stage, padding);
    const scaledW = (frame.width ?? 0) * view.scale;
    const scaledH = (frame.height ?? 0) * view.scale;
    expect(scaledW).toBeLessThanOrEqual(stage.width - padding * 2 + 0.001);
    expect(scaledH).toBeLessThanOrEqual(stage.height - padding * 2 + 0.001);
  });

  it('clamps scale to minimum 0.1 for very large frames', () => {
    const huge = makeEl({ id: 'f1', type: 'frame', x: 0, y: 0, width: 100000, height: 100000 });
    const view = viewportForFrame(huge, stage);
    expect(view.scale).toBeGreaterThanOrEqual(0.1);
  });

  it('clamps scale to maximum 4 for very small frames', () => {
    const tiny = makeEl({ id: 'f1', type: 'frame', x: 0, y: 0, width: 1, height: 1 });
    const view = viewportForFrame(tiny, stage);
    expect(view.scale).toBeLessThanOrEqual(4);
  });

  it('uses default padding of 40 when not specified', () => {
    const frame = makeEl({ id: 'f1', type: 'frame', x: 0, y: 0, width: 400, height: 300 });
    const withDefault = viewportForFrame(frame, stage);
    const withExplicit = viewportForFrame(frame, stage, 40);
    expect(withDefault).toEqual(withExplicit);
  });

  it('works with a non-origin frame position', () => {
    const frame = makeEl({ id: 'f1', type: 'frame', x: 1000, y: 500, width: 800, height: 600 });
    const view = viewportForFrame(frame, stage);
    const frameCenterX = (frame.x + (frame.width ?? 0) / 2) * view.scale + view.x;
    const frameCenterY = (frame.y + (frame.height ?? 0) / 2) * view.scale + view.y;
    expect(frameCenterX).toBeCloseTo(stage.width / 2, 1);
    expect(frameCenterY).toBeCloseTo(stage.height / 2, 1);
  });
});
