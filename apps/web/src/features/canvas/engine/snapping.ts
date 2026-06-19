export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Guide {
  orientation: 'v' | 'h';
  pos: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function linesX(r: Rect): number[] {
  return [r.x, r.x + r.width / 2, r.x + r.width];
}
function linesY(r: Rect): number[] {
  return [r.y, r.y + r.height / 2, r.y + r.height];
}

/**
 * Snap a moving rect's edges/centers to the nearest candidate edge/center
 * within `threshold`. Returns the offset to apply plus guide lines to draw.
 */
export function snapMove(moving: Rect, candidates: Rect[], threshold = 6): SnapResult {
  let bestX: { delta: number; pos: number } | null = null;
  let bestY: { delta: number; pos: number } | null = null;

  for (const c of candidates) {
    for (const ml of linesX(moving)) {
      for (const cl of linesX(c)) {
        const delta = cl - ml;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, pos: cl };
        }
      }
    }
    for (const ml of linesY(moving)) {
      for (const cl of linesY(c)) {
        const delta = cl - ml;
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, pos: cl };
        }
      }
    }
  }

  const guides: Guide[] = [];
  if (bestX) guides.push({ orientation: 'v', pos: bestX.pos });
  if (bestY) guides.push({ orientation: 'h', pos: bestY.pos });
  return { dx: bestX?.delta ?? 0, dy: bestY?.delta ?? 0, guides };
}
