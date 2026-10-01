import type { CanvasElement, ElementType } from '@syncflow/shared';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActiveStyle {
  stroke: string;
  fill: string | null;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  fontSize: number;
}

const BOX_TYPES: ElementType[] = [
  'rect',
  'ellipse',
  'sticky',
  'text',
  'diamond',
  'triangle',
  'star',
  'image',
  'code',
  'frame',
  'embed',
  'mindnode',
];

export function isBoxType(t: ElementType): boolean {
  return BOX_TYPES.includes(t);
}

/** Axis-aligned box of a point set, or null when there are no points. */
function boxOf(xs: number[], ys: number[]): Rect | null {
  if (xs.length === 0) return null;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * Axis-aligned bounds in board coordinates.
 *
 * Rotation is applied about (x, y) — the same pivot Konva uses for a node with
 * no offset — so a rotated shape's box covers what is actually drawn. Culling
 * and marquee both test against this box; the unrotated one let a long rotated
 * shape be culled while still on screen, or be missed by a marquee over it.
 *
 * Connectors carry no geometry of their own. Only their FIXED endpoints are
 * known here; endpoints bound to other elements need the element set, so use
 * `elementBounds` in connector.ts wherever that set is available.
 */
export function getBounds(el: CanvasElement): Rect {
  if (el.type === 'connector') {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const end of [el.from, el.to]) {
      if (end && typeof end.x === 'number' && typeof end.y === 'number') {
        xs.push(end.x);
        ys.push(end.y);
      }
    }
    return boxOf(xs, ys) ?? { x: el.x, y: el.y, width: 0, height: 0 };
  }

  // Local-space corners/points, relative to (x, y).
  const lx: number[] = [];
  const ly: number[] = [];
  if (el.points && el.points.length >= 2) {
    for (let i = 0; i + 1 < el.points.length; i += 2) {
      lx.push(el.points[i]!);
      ly.push(el.points[i + 1]!);
    }
  } else {
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    lx.push(0, w, w, 0);
    ly.push(0, 0, h, h);
  }

  const rot = el.rotation ?? 0;
  if (rot % 360 === 0) {
    const local = boxOf(lx, ly)!;
    return { x: el.x + local.x, y: el.y + local.y, width: local.width, height: local.height };
  }
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < lx.length; i++) {
    const px = lx[i]!;
    const py = ly[i]!;
    xs.push(el.x + px * cos - py * sin);
    ys.push(el.y + px * sin + py * cos);
  }
  return boxOf(xs, ys)!;
}

/**
 * Deterministic paint order: zIndex, then id. Two peers placing a shape at the
 * same moment can both pick the same "next" zIndex; without a tiebreak each
 * client would stack them by its own insertion order and the boards disagree.
 */
export function compareZ(a: CanvasElement, b: CanvasElement): number {
  const dz = (a.zIndex ?? 0) - (b.zIndex ?? 0);
  if (dz !== 0) return dz;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function createElement(
  type: ElementType,
  point: { x: number; y: number },
  zIndex: number,
  s: ActiveStyle,
): CanvasElement {
  const base: CanvasElement = {
    id: crypto.randomUUID(),
    type,
    x: point.x,
    y: point.y,
    rotation: 0,
    opacity: 1,
    zIndex,
    fill: s.fill,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
  };
  switch (type) {
    case 'sticky':
      return { ...base, width: 160, height: 120, fill: '#FFEFB0', stroke: '#E8D27A', text: '', fontSize: 16 };
    case 'text':
      return { ...base, width: 200, height: 28, fill: null, strokeWidth: 0, text: 'Text', fontSize: s.fontSize };
    case 'code':
      return {
        ...base,
        width: 280,
        height: 140,
        fill: '#1E1E26',
        stroke: '#2A2A33',
        strokeWidth: 1,
        text: '// code',
        fontSize: 13,
        language: 'js',
      };
    case 'embed':
      return {
        ...base,
        width: 240,
        height: 72,
        fill: null,
        strokeWidth: 1,
        url: '',
        title: '',
        faviconUrl: '',
      };
    case 'frame':
      return { ...base, zIndex: -1, width: 480, height: 320, name: 'Frame', fill: null, stroke: 'auto' };
    case 'mindnode':
      return { ...base, width: 140, height: 44, text: 'Idea', fontSize: 14, fill: null, stroke: '#6366F1' };
    case 'line':
      return { ...base, points: [0, 0, 0, 0] };
    case 'freehand':
      return { ...base, points: [0, 0] };
    default:
      return { ...base, width: 0, height: 0 };
  }
}
