import { describe, expect, it } from 'vitest';
import { LASER_FADE_MS, laserLife, laserRibbon, smoothLaser, type LaserPoint } from './laser';

const pts = (n: number, t0: number, dt: number): LaserPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, t: t0 + i * dt }));

describe('laserLife', () => {
  it('is 1 when fresh, 0 once faded, and clamped in between', () => {
    expect(laserLife({ x: 0, y: 0, t: 1000 }, 1000)).toBe(1);
    expect(laserLife({ x: 0, y: 0, t: 1000 }, 1000 + LASER_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(laserLife({ x: 0, y: 0, t: 1000 }, 1000 + LASER_FADE_MS * 2)).toBe(0);
    expect(laserLife({ x: 0, y: 0, t: 2000 }, 1000)).toBe(1);
  });
});

describe('smoothLaser', () => {
  it('keeps both endpoints so the head stays on the pointer', () => {
    const input = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 10, t: 1 },
      { x: 20, y: 0, t: 2 },
    ];
    const out = smoothLaser(input);
    expect(out[0]).toEqual(input[0]);
    expect(out[out.length - 1]).toEqual(input[2]);
    expect(out.length).toBeGreaterThan(input.length);
  });

  it('leaves two-point trails alone', () => {
    const input = pts(2, 0, 1);
    expect(smoothLaser(input)).toEqual(input);
  });
});

describe('laserRibbon', () => {
  it('is empty until two points are alive', () => {
    expect(laserRibbon(pts(1, 0, 10), 0, 8)).toEqual([]);
    expect(laserRibbon(pts(5, 0, 10), LASER_FADE_MS * 3, 8)).toEqual([]);
  });

  it('is full width at the head and tapers to nothing at a faded tail', () => {
    const now = 1000;
    // Tail point is exactly faded-out-but-alive edge; head is fresh.
    const trail: LaserPoint[] = [
      { x: 0, y: 0, t: now - LASER_FADE_MS + 1 },
      { x: 50, y: 0, t: now - 500 },
      { x: 100, y: 0, t: now },
    ];
    const outline = laserRibbon(trail, now, 10);
    // left side (3 points) then right side reversed (3 points) → 12 numbers.
    expect(outline).toHaveLength(12);
    const headTop = outline[5]!; // y of left head point
    const tailTop = outline[1]!; // y of left tail point
    expect(Math.abs(headTop)).toBeCloseTo(5);
    expect(Math.abs(tailTop)).toBeLessThan(0.5);
  });
});
