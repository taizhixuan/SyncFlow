import { describe, expect, it } from 'vitest';
import { snapToGrid, snapMove } from './snapping';

describe('snapToGrid', () => {
  it('rounds to the nearest grid step', () => {
    expect(snapToGrid(23, 10)).toBe(20);
    expect(snapToGrid(26, 10)).toBe(30);
  });
});

describe('snapMove', () => {
  const moving = { x: 98, y: 0, width: 40, height: 20 };

  it('snaps a near-aligned left edge and emits a guide', () => {
    const res = snapMove(moving, [{ x: 100, y: 300, width: 40, height: 20 }], 6);
    expect(res.dx).toBe(2);
    expect(res.guides.some((g) => g.orientation === 'v' && g.pos === 100)).toBe(true);
  });

  it('does not snap when no candidate edge is within threshold', () => {
    const res = snapMove(moving, [{ x: 400, y: 300, width: 40, height: 20 }], 6);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
    expect(res.guides).toHaveLength(0);
  });
});
