import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { align, distribute } from './align';

const box = (id: string, x: number, y: number, w = 40, h = 20): CanvasElement =>
  ({ id, type: 'rect', x, y, width: w, height: h }) as CanvasElement;

describe('align', () => {
  it('aligns left edges to the leftmost element', () => {
    const patches = align([box('a', 10, 0), box('b', 100, 50)], 'left');
    expect(patches.a!.x).toBe(10);
    expect(patches.b!.x).toBe(10);
  });

  it('aligns horizontal centers', () => {
    const patches = align([box('a', 0, 0, 40, 20), box('b', 0, 100, 80, 20)], 'centerX');
    // selection center x: min left 0, max right 80 -> center 40; a center should land at 40 => x=20
    expect(patches.a!.x).toBe(20);
    expect(patches.b!.x).toBe(0);
  });

  it('aligns bottom edges to the lowest element', () => {
    const patches = align([box('a', 0, 0, 40, 20), box('b', 0, 100, 40, 40)], 'bottom');
    // lowest bottom = 140; a bottom should be 140 => y = 120
    expect(patches.a!.y).toBe(120);
    expect(patches.b!.y).toBe(100);
  });
});

describe('distribute', () => {
  it('evenly spaces horizontal centers between the extremes', () => {
    const patches = distribute(
      [box('a', 0, 0, 20, 20), box('b', 30, 0, 20, 20), box('c', 200, 0, 20, 20)],
      'horizontal',
    );
    // centers: a=10, c=210 fixed; b center should be midway -> 110 => x = 100
    expect(patches.b!.x).toBe(100);
    expect(patches.a).toBeUndefined();
    expect(patches.c).toBeUndefined();
  });
});
