import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { selectionBounds, elementsInMarquee, marqueeRect, mergeMarquee } from './selection';

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

describe('marqueeRect', () => {
  it('normalizes a top-left → bottom-right drag', () => {
    expect(marqueeRect({ x: 10, y: 20 }, { x: 60, y: 80 })).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 60,
    });
  });
  it('normalizes a reversed (bottom-right → top-left) drag', () => {
    expect(marqueeRect({ x: 60, y: 80 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 60,
    });
  });
});

describe('mergeMarquee', () => {
  it('replaces the selection when not additive', () => {
    expect(mergeMarquee(['a', 'b'], ['c', 'd'], false)).toEqual(['c', 'd']);
  });
  it('unions base and hits when additive', () => {
    expect(mergeMarquee(['a', 'b'], ['c'], true)).toEqual(['a', 'b', 'c']);
  });
  it('de-duplicates when additive hits overlap the base', () => {
    expect(mergeMarquee(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'b', 'c']);
  });
});
