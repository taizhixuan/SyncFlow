import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { arrangeRow, arrangeColumn, ARRANGE_GAP } from './arrange';

function box(id: string, x: number, y: number, w = 80, h = 40): CanvasElement {
  return {
    id,
    type: 'rect',
    x,
    y,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 1,
    strokeStyle: 'solid',
    width: w,
    height: h,
  } as CanvasElement;
}

describe('arrangeRow', () => {
  it('returns empty object for a single element (no-op)', () => {
    const patches = arrangeRow([box('a', 100, 50)]);
    expect(Object.keys(patches)).toHaveLength(0);
  });

  it('returns empty object for empty array', () => {
    expect(Object.keys(arrangeRow([]))).toHaveLength(0);
  });

  it('sorts by x and places elements left-to-right from min x', () => {
    // b is further right but listed first — should sort b before c before a? No: by current x
    // a at x=200, b at x=0, c at x=100 => sorted order: b, c, a
    const els = [box('a', 200, 50), box('b', 0, 50), box('c', 100, 50)];
    const patches = arrangeRow(els);

    // sorted: b(x=0), c(x=100), a(x=200)
    // start at min x = 0
    // b: x=0,  next = 0 + 80 + 32 = 112
    // c: x=112, next = 112 + 80 + 32 = 224
    // a: x=224
    expect(patches['b']!.x).toBe(0);
    expect(patches['c']!.x).toBe(80 + ARRANGE_GAP);
    expect(patches['a']!.x).toBe(80 + ARRANGE_GAP + 80 + ARRANGE_GAP);
  });

  it('all elements share the same y (min y of selection)', () => {
    const els = [box('a', 0, 100), box('b', 200, 50), box('c', 400, 75)];
    const patches = arrangeRow(els);
    const minY = 50; // min of 100, 50, 75
    for (const patch of Object.values(patches)) {
      expect(patch.y).toBe(minY);
    }
  });

  it('respects differing element widths in spacing', () => {
    // a: w=40, b: w=100
    // sorted by x: a(x=0,w=40), b(x=200,w=100)
    // a stays at x=0, b at x=0+40+32=72
    const els = [box('a', 0, 0, 40), box('b', 200, 0, 100)];
    const patches = arrangeRow(els);
    expect(patches['a']!.x).toBe(0);
    expect(patches['b']!.x).toBe(40 + ARRANGE_GAP);
  });

  it('custom gap is respected', () => {
    const els = [box('a', 0, 0), box('b', 200, 0)];
    const patches = arrangeRow(els, 10);
    expect(patches['a']!.x).toBe(0);
    expect(patches['b']!.x).toBe(80 + 10);
  });
});

describe('arrangeColumn', () => {
  it('returns empty object for a single element (no-op)', () => {
    const patches = arrangeColumn([box('a', 0, 100)]);
    expect(Object.keys(patches)).toHaveLength(0);
  });

  it('sorts by y and places elements top-to-bottom from min y', () => {
    // a at y=200, b at y=0, c at y=100 => sorted: b, c, a
    const els = [box('a', 0, 200), box('b', 0, 0), box('c', 0, 100)];
    const patches = arrangeColumn(els);

    // sorted: b(y=0), c(y=100), a(y=200)
    // start at min y = 0
    // b: y=0, next = 0 + 40 + 32 = 72
    // c: y=72, next = 72 + 40 + 32 = 144
    // a: y=144
    expect(patches['b']!.y).toBe(0);
    expect(patches['c']!.y).toBe(40 + ARRANGE_GAP);
    expect(patches['a']!.y).toBe(40 + ARRANGE_GAP + 40 + ARRANGE_GAP);
  });

  it('all elements share the same x (min x of selection)', () => {
    const els = [box('a', 100, 0), box('b', 50, 100), box('c', 75, 200)];
    const patches = arrangeColumn(els);
    const minX = 50;
    for (const patch of Object.values(patches)) {
      expect(patch.x).toBe(minX);
    }
  });

  it('respects differing element heights in spacing', () => {
    // a: h=20, b: h=60
    // sorted by y: a(y=0,h=20), b(y=200,h=60)
    // a stays at y=0, b at y=0+20+32=52
    const els = [box('a', 0, 0, 80, 20), box('b', 0, 200, 80, 60)];
    const patches = arrangeColumn(els);
    expect(patches['a']!.y).toBe(0);
    expect(patches['b']!.y).toBe(20 + ARRANGE_GAP);
  });
});
