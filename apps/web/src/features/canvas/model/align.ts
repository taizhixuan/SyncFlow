import type { CanvasElement, CanvasElementPatch } from '@syncflow/shared';
import { getBounds } from './element';

export type AlignAxis = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

type Patches = Record<string, CanvasElementPatch>;

/** Align a selection's edges/centers; returns position patches per element. */
export function align(els: CanvasElement[], axis: AlignAxis): Patches {
  if (els.length < 2) return {};
  const bounds = els.map((el) => ({ el, b: getBounds(el) }));
  const lefts = bounds.map((x) => x.b.x);
  const rights = bounds.map((x) => x.b.x + x.b.width);
  const tops = bounds.map((x) => x.b.y);
  const bottoms = bounds.map((x) => x.b.y + x.b.height);
  const minLeft = Math.min(...lefts);
  const maxRight = Math.max(...rights);
  const minTop = Math.min(...tops);
  const maxBottom = Math.max(...bottoms);
  const centerX = (minLeft + maxRight) / 2;
  const middleY = (minTop + maxBottom) / 2;

  const patches: Patches = {};
  for (const { el, b } of bounds) {
    switch (axis) {
      case 'left':
        patches[el.id] = { x: el.x + (minLeft - b.x) };
        break;
      case 'right':
        patches[el.id] = { x: el.x + (maxRight - (b.x + b.width)) };
        break;
      case 'centerX':
        patches[el.id] = { x: el.x + (centerX - (b.x + b.width / 2)) };
        break;
      case 'top':
        patches[el.id] = { y: el.y + (minTop - b.y) };
        break;
      case 'bottom':
        patches[el.id] = { y: el.y + (maxBottom - (b.y + b.height)) };
        break;
      case 'middleY':
        patches[el.id] = { y: el.y + (middleY - (b.y + b.height / 2)) };
        break;
    }
  }
  return patches;
}

/** Evenly space the inner elements' centers between the two extreme elements. */
export function distribute(els: CanvasElement[], axis: DistributeAxis): Patches {
  if (els.length < 3) return {};
  const horizontal = axis === 'horizontal';
  const items = els
    .map((el) => {
      const b = getBounds(el);
      return { el, b, center: horizontal ? b.x + b.width / 2 : b.y + b.height / 2 };
    })
    .sort((p, q) => p.center - q.center);

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const step = (last.center - first.center) / (items.length - 1);

  const patches: Patches = {};
  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i]!;
    const targetCenter = first.center + step * i;
    if (horizontal) {
      patches[item.el.id] = { x: item.el.x + (targetCenter - (item.b.x + item.b.width / 2)) };
    } else {
      patches[item.el.id] = { y: item.el.y + (targetCenter - (item.b.y + item.b.height / 2)) };
    }
  }
  return patches;
}
