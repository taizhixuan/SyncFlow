/** A sampled laser position in canvas units, stamped with the time it was drawn. */
export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

/** How long a laser point stays visible, in ms. */
export const LASER_FADE_MS = 1000;

/** Remaining life of a point: 1 when just drawn, 0 once faded. */
export function laserLife(p: LaserPoint, now: number): number {
  return Math.max(0, Math.min(1, 1 - (now - p.t) / LASER_FADE_MS));
}

/**
 * Chaikin corner-cutting: rounds the polyline that pointer sampling produces so
 * the stroke reads as one smooth sweep rather than a chain of straight pieces.
 * Endpoints are kept, so the head stays exactly on the pointer.
 */
export function smoothLaser(points: readonly LaserPoint[], iterations = 2): LaserPoint[] {
  let pts = [...points];
  for (let k = 0; k < iterations && pts.length > 2; k++) {
    const next: LaserPoint[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      next.push(
        { x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y, t: 0.75 * a.t + 0.25 * b.t },
        { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y, t: 0.25 * a.t + 0.75 * b.t },
      );
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts;
}

/**
 * Outline of a tapered ribbon along the trail, as a closed polygon of flat
 * [x0, y0, x1, y1, …] coordinates: full `width` at the head, narrowing to
 * nothing as points age out. Empty when fewer than two points are still alive.
 */
export function laserRibbon(points: readonly LaserPoint[], now: number, width: number): number[] {
  const alive = points.filter((p) => laserLife(p, now) > 0);
  if (alive.length < 2) return [];
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < alive.length; i++) {
    const p = alive[i]!;
    const prev = alive[Math.max(0, i - 1)]!;
    const next = alive[Math.min(alive.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // Ease the taper so the stroke stays bold near the head and thins late.
    const half = (width / 2) * Math.sqrt(laserLife(p, now));
    left.push(p.x - dy * half, p.y + dx * half);
    right.push(p.x + dy * half, p.y - dx * half);
  }
  const outline = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) outline.push(right[i]!, right[i + 1]!);
  return outline;
}
