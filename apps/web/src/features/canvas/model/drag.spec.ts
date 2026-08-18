import { describe, expect, it } from 'vitest';

import { dragPatches } from './drag';

const starts = (entries: Array<[string, number, number]>): Map<string, { x: number; y: number }> =>
  new Map(entries.map(([id, x, y]) => [id, { x, y }]));

describe('dragPatches', () => {
  it('moves a single dragged element to where it landed', () => {
    const start = starts([['a', 10, 20]]);
    expect(dragPatches(['a'], start, 'a', { x: 50, y: 70 })).toEqual({ a: { x: 50, y: 70 } });
  });

  it('moves every follower by the same delta as the anchor', () => {
    const start = starts([['a', 10, 20], ['b', 100, 200], ['c', -50, -60]]);
    expect(dragPatches(['a', 'b', 'c'], start, 'a', { x: 40, y: 50 })).toEqual({
      a: { x: 40, y: 50 },
      b: { x: 130, y: 230 },
      c: { x: -20, y: -30 },
    });
  });

  it('patches followers that were never mounted', () => {
    // The regression this function exists for: a frame child far off-screen is
    // culled and has no Konva node, but must still travel with its frame.
    const start = starts([['frame', 0, 0], ['onscreen', 50, 50], ['culled', 9000, 9000]]);
    const patches = dragPatches(['frame', 'onscreen', 'culled'], start, 'frame', { x: 120, y: 90 });

    expect(patches.culled).toEqual({ x: 9120, y: 9090 });
    expect(patches.onscreen).toEqual({ x: 170, y: 140 });
  });

  it('keeps the whole set rigid — every element shifts identically', () => {
    const start = starts([['a', 0, 0], ['b', 33, 77], ['c', -12.5, 4.25]]);
    const patches = dragPatches(['a', 'b', 'c'], start, 'b', { x: 43, y: 97 });
    const deltas = Object.entries(patches).map(([id, p]) => {
      const from = start.get(id)!;
      return [p.x - from.x, p.y - from.y];
    });
    expect(deltas).toEqual([[10, 20], [10, 20], [10, 20]]);
  });

  it('produces no movement when the anchor did not move', () => {
    const start = starts([['a', 10, 20], ['b', 30, 40]]);
    expect(dragPatches(['a', 'b'], start, 'a', { x: 10, y: 20 })).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 30, y: 40 },
    });
  });

  it('skips ids with no recorded start position', () => {
    const start = starts([['a', 10, 20]]);
    const patches = dragPatches(['a', 'ghost'], start, 'a', { x: 15, y: 25 });
    expect(patches).toEqual({ a: { x: 15, y: 25 } });
  });

  it('still commits the anchor when the gesture captured no start state', () => {
    expect(dragPatches(['a'], new Map(), 'a', { x: 7, y: 8 })).toEqual({ a: { x: 7, y: 8 } });
  });
});
