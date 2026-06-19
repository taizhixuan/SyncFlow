import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { selectionBounds, elementsInMarquee } from './selection';

const box = (id: string, x: number, y: number): CanvasElement =>
  ({ id, type: 'rect', x, y, width: 50, height: 40 }) as CanvasElement;

describe('selection', () => {
  it('returns null for an empty selection', () => {
    expect(selectionBounds([])).toBeNull();
  });
  it('computes the union bounds of multiple elements', () => {
    expect(selectionBounds([box('a', 0, 0), box('b', 100, 60)])).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 100,
    });
  });
  it('finds elements intersecting a marquee', () => {
    const ids = elementsInMarquee([box('a', 0, 0), box('b', 500, 500)], {
      x: -10,
      y: -10,
      width: 80,
      height: 80,
    });
    expect(ids).toEqual(['a']);
  });
});
