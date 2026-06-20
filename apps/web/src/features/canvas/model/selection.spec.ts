import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import {
  selectionBounds,
  elementsInMarquee,
  marqueeRect,
  mergeMarquee,
  connectorsInMarquee,
} from './selection';

const box = (id: string, x: number, y: number): CanvasElement =>
  ({ id, type: 'rect', x, y, width: 50, height: 40 }) as CanvasElement;

const conn = (
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): CanvasElement => ({ id, type: 'connector', x: 0, y: 0, from, to }) as CanvasElement;

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

describe('connectorsInMarquee', () => {
  it('selects a connector whose segment crosses the marquee', () => {
    const ids = connectorsInMarquee([conn('c', { x: 0, y: 50 }, { x: 100, y: 50 })], {}, {
      x: 40,
      y: 40,
      width: 20,
      height: 20,
    });
    expect(ids).toEqual(['c']);
  });
  it('selects a connector with an endpoint inside the marquee', () => {
    const ids = connectorsInMarquee([conn('c', { x: 5, y: 5 }, { x: 300, y: 300 })], {}, {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    });
    expect(ids).toEqual(['c']);
  });
  it('ignores a connector entirely outside the marquee', () => {
    const ids = connectorsInMarquee([conn('c', { x: 0, y: 50 }, { x: 100, y: 50 })], {}, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(ids).toEqual([]);
  });
  it('does not over-select: a diagonal whose bbox overlaps but whose line misses', () => {
    // Connector runs (0,0)→(100,100); marquee sits in the top-right of that
    // bbox where the diagonal never passes. A bbox test would wrongly match.
    const ids = connectorsInMarquee([conn('c', { x: 0, y: 0 }, { x: 100, y: 100 })], {}, {
      x: 80,
      y: 0,
      width: 15,
      height: 15,
    });
    expect(ids).toEqual([]);
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
