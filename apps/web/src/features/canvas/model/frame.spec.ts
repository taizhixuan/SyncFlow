import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { elementsInFrame } from './frame';

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

const frame = makeEl({ id: 'f1', type: 'frame', x: 100, y: 100, width: 400, height: 300 });

describe('elementsInFrame', () => {
  it('returns ids of non-frame elements whose bounds-center lies within the frame', () => {
    const inside = makeEl({ id: 'r1', type: 'rect', x: 150, y: 150, width: 100, height: 80 });
    // center: (200, 190) — inside frame (100-500, 100-400)
    const result = elementsInFrame(frame, [frame, inside]);
    expect(result).toEqual(['r1']);
  });

  it('includes element partially overlapping but center inside', () => {
    // element overlaps left edge of frame; center is still inside
    const partial = makeEl({ id: 'r2', type: 'rect', x: 50, y: 200, width: 120, height: 60 });
    // bounds: x=50..170, y=200..260; center: (110, 230) — inside frame
    const result = elementsInFrame(frame, [frame, partial]);
    expect(result).toContain('r2');
  });

  it('excludes elements whose center is outside the frame', () => {
    const outside = makeEl({ id: 'r3', type: 'rect', x: 10, y: 10, width: 60, height: 60 });
    // center: (40, 40) — outside frame (100-500, 100-400)
    const result = elementsInFrame(frame, [frame, outside]);
    expect(result).not.toContain('r3');
  });

  it('excludes the frame itself', () => {
    const result = elementsInFrame(frame, [frame]);
    expect(result).not.toContain('f1');
  });

  it('excludes other frame elements even if their center is inside', () => {
    const innerFrame = makeEl({ id: 'f2', type: 'frame', x: 150, y: 150, width: 100, height: 80 });
    const result = elementsInFrame(frame, [frame, innerFrame]);
    expect(result).not.toContain('f2');
  });

  it('returns empty array for an empty doc', () => {
    const result = elementsInFrame(frame, []);
    expect(result).toEqual([]);
  });

  it('returns empty array when no elements are inside', () => {
    const far = makeEl({ id: 'r4', type: 'rect', x: 600, y: 600, width: 50, height: 50 });
    const result = elementsInFrame(frame, [far]);
    expect(result).toEqual([]);
  });

  it('handles line elements using their points bounds', () => {
    // line from (150,150) to (250,250) — center at (200, 200) inside frame
    const line = makeEl({ id: 'l1', type: 'line', x: 150, y: 150, points: [0, 0, 100, 100] });
    const result = elementsInFrame(frame, [frame, line]);
    expect(result).toContain('l1');
  });
});
