import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';

import {
  CULL_MIN_ELEMENTS,
  cullElements,
  intersects,
  viewportBounds,
} from './culling';

const el = (id: string, x: number, y: number, overrides: Partial<CanvasElement> = {}): CanvasElement =>
  ({
    id,
    type: 'rect',
    x,
    y,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
    strokeStyle: 'solid',
    ...overrides,
  }) as CanvasElement;

/** A board large enough that culling is switched on. */
const manyAt = (positions: Array<[number, number]>): CanvasElement[] => {
  const out = positions.map(([x, y], i) => el('near-' + i, x, y));
  // Pad far off-screen so the array clears CULL_MIN_ELEMENTS.
  for (let i = out.length; i < CULL_MIN_ELEMENTS + 20; i++) {
    out.push(el('far-' + i, 500_000 + i * 200, 500_000));
  }
  return out;
};

describe('viewportBounds', () => {
  it('maps an unpanned, unzoomed view onto the canvas origin', () => {
    const b = viewportBounds({ x: 0, y: 0, scale: 1 }, { width: 800, height: 600 }, 0);
    // toBeCloseTo rather than toEqual: negating a zero pan yields -0, which is
    // arithmetically identical but not deeply equal to 0.
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBeCloseTo(0);
    expect(b.width).toBe(800);
    expect(b.height).toBe(600);
  });

  it('accounts for pan', () => {
    // Panning content right by 200px means the viewport starts 200 canvas units
    // to the LEFT of the origin.
    const b = viewportBounds({ x: 200, y: 100, scale: 1 }, { width: 800, height: 600 }, 0);
    expect(b).toMatchObject({ x: -200, y: -100, width: 800, height: 600 });
  });

  it('covers more canvas as you zoom out', () => {
    const inClose = viewportBounds({ x: 0, y: 0, scale: 2 }, { width: 800, height: 600 }, 0);
    const outFar = viewportBounds({ x: 0, y: 0, scale: 0.5 }, { width: 800, height: 600 }, 0);
    expect(inClose.width).toBe(400);
    expect(outFar.width).toBe(1600);
  });

  it('keeps the margin a constant screen distance across zoom levels', () => {
    const at1 = viewportBounds({ x: 0, y: 0, scale: 1 }, { width: 800, height: 600 }, 100);
    const at2 = viewportBounds({ x: 0, y: 0, scale: 2 }, { width: 800, height: 600 }, 100);
    expect(at1.x).toBe(-100); // 100 screen px = 100 canvas units at 1x
    expect(at2.x).toBe(-50); //  100 screen px =  50 canvas units at 2x
  });

  it('survives a degenerate scale instead of dividing by zero', () => {
    const b = viewportBounds({ x: 0, y: 0, scale: 0 }, { width: 800, height: 600 }, 0);
    expect(Number.isFinite(b.width)).toBe(true);
  });
});

describe('intersects', () => {
  const view = { x: 0, y: 0, width: 100, height: 100 };

  it('detects overlap and separation', () => {
    expect(intersects({ x: 50, y: 50, width: 10, height: 10 }, view)).toBe(true);
    expect(intersects({ x: 500, y: 0, width: 10, height: 10 }, view)).toBe(false);
    expect(intersects({ x: 0, y: 500, width: 10, height: 10 }, view)).toBe(false);
  });

  it('counts a partly-overlapping element as visible', () => {
    expect(intersects({ x: -5, y: -5, width: 10, height: 10 }, view)).toBe(true);
    expect(intersects({ x: 95, y: 95, width: 50, height: 50 }, view)).toBe(true);
  });

  it('counts an element larger than the viewport as visible', () => {
    expect(intersects({ x: -1000, y: -1000, width: 5000, height: 5000 }, view)).toBe(true);
  });
});

describe('cullElements', () => {
  const viewport = { x: 0, y: 0, width: 800, height: 600 };
  const none = new Set<string>();

  it('leaves a small board completely alone', () => {
    const small = [el('a', 0, 0), el('b', 999_999, 999_999)];
    // Same array back — identity is what lets React skip the re-render.
    expect(cullElements(small, viewport, none)).toBe(small);
  });

  it('drops off-screen elements once the board is large enough', () => {
    const all = manyAt([[0, 0], [100, 100], [700, 500]]);
    const visible = cullElements(all, viewport, none);
    expect(visible.length).toBe(3);
    expect(visible.map((e) => e.id)).toEqual(['near-0', 'near-1', 'near-2']);
  });

  it('always keeps ids in the keep set, however far off-screen', () => {
    const all = manyAt([[0, 0]]);
    const faraway = all[all.length - 1]!;
    const visible = cullElements(all, viewport, new Set([faraway.id]));
    expect(visible.map((e) => e.id)).toContain(faraway.id);
  });

  it('returns the input array when everything is visible', () => {
    const all = manyAt([]).map((e, i) => el('v' + i, i % 700, 0));
    expect(cullElements(all, viewport, none)).toBe(all);
  });

  it('measures freehand elements by their points, not their origin', () => {
    // A stroke anchored off-screen whose points extend into view must survive.
    const stroke = el('stroke', -1000, -1000, {
      width: 0,
      height: 0,
      points: [0, 0, 1200, 1200],
    });
    const all = [stroke, ...manyAt([])];
    const visible = cullElements(all, viewport, none);
    expect(visible.map((e) => e.id)).toContain('stroke');
  });

  it('preserves document order among the survivors', () => {
    const all = manyAt([[700, 500], [0, 0], [100, 100]]);
    const visible = cullElements(all, viewport, none);
    expect(visible.map((e) => e.id)).toEqual(['near-0', 'near-1', 'near-2']);
  });
});
