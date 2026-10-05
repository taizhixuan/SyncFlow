import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import { getBounds, type Rect } from './element';
import { translatePatch } from './drag';
import { selectionUnits } from './group';

export type AlignAxis = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

type Patches = Record<string, CanvasElementPatch>;

interface Unit {
  members: CanvasElement[];
  b: Rect;
}

/**
 * Connectors are positioned by their endpoints and their nominal box sits at
 * the origin; one with a bound end has no box of its own to measure. Only a
 * fully free arrow has a box that means anything.
 */
function measurable(el: CanvasElement): boolean {
  if (el.type !== 'connector') return true;
  return el.from?.elementId === undefined && el.to?.elementId === undefined && !!el.from && !!el.to;
}

/**
 * The selection as the units arranging moves: a group (at the selection's
 * level) is one unit measured by its union bounds, so aligning keeps its
 * layout instead of stacking its members. Locked elements take no part, and a
 * unit with nothing measurable (e.g. a bound connector alone) is left out.
 */
function unitsOf(all: CanvasElement[]): Unit[] {
  const out: Unit[] = [];
  for (const members of selectionUnits(all.filter((el) => !el.locked))) {
    let b: Rect | null = null;
    for (const el of members) {
      if (!measurable(el)) continue;
      const r = getBounds(el);
      if (!b) b = r;
      else {
        const x = Math.min(b.x, r.x);
        const y = Math.min(b.y, r.y);
        b = {
          x,
          y,
          width: Math.max(b.x + b.width, r.x + r.width) - x,
          height: Math.max(b.y + b.height, r.y + r.height) - y,
        };
      }
    }
    if (b) out.push({ members, b });
  }
  return out;
}

function move(patches: Patches, unit: Unit, dx: number, dy: number): void {
  for (const el of unit.members) patches[el.id] = translatePatch(el, dx, dy);
}

/** Align a selection's edges/centers; returns position patches per element. */
export function align(all: CanvasElement[], axis: AlignAxis): Patches {
  const units = unitsOf(all);
  if (units.length < 2) return {};
  const minLeft = Math.min(...units.map(({ b }) => b.x));
  const maxRight = Math.max(...units.map(({ b }) => b.x + b.width));
  const minTop = Math.min(...units.map(({ b }) => b.y));
  const maxBottom = Math.max(...units.map(({ b }) => b.y + b.height));
  const centerX = (minLeft + maxRight) / 2;
  const middleY = (minTop + maxBottom) / 2;

  const patches: Patches = {};
  for (const unit of units) {
    const { b } = unit;
    switch (axis) {
      case 'left':
        move(patches, unit, minLeft - b.x, 0);
        break;
      case 'right':
        move(patches, unit, maxRight - (b.x + b.width), 0);
        break;
      case 'centerX':
        move(patches, unit, centerX - (b.x + b.width / 2), 0);
        break;
      case 'top':
        move(patches, unit, 0, minTop - b.y);
        break;
      case 'bottom':
        move(patches, unit, 0, maxBottom - (b.y + b.height));
        break;
      case 'middleY':
        move(patches, unit, 0, middleY - (b.y + b.height / 2));
        break;
    }
  }
  return patches;
}

/** Evenly space the inner units' centers between the two extreme units. */
export function distribute(all: CanvasElement[], axis: DistributeAxis): Patches {
  const horizontal = axis === 'horizontal';
  const items = unitsOf(all)
    .map((unit) => ({ unit, center: horizontal ? unit.b.x + unit.b.width / 2 : unit.b.y + unit.b.height / 2 }))
    .sort((p, q) => p.center - q.center);
  if (items.length < 3) return {};

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const step = (last.center - first.center) / (items.length - 1);

  const patches: Patches = {};
  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i]!;
    const delta = first.center + step * i - item.center;
    move(patches, item.unit, horizontal ? delta : 0, horizontal ? 0 : delta);
  }
  return patches;
}
