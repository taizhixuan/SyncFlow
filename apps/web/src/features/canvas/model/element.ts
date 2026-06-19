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
  'mindnode',
];

export function isBoxType(t: ElementType): boolean {
  return BOX_TYPES.includes(t);
}

export function getBounds(el: CanvasElement): Rect {
  if (el.points && el.points.length >= 2) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i + 1 < el.points.length; i += 2) {
      xs.push(el.points[i]!);
      ys.push(el.points[i + 1]!);
    }
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: el.x + minX, y: el.y + minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
  return { x: el.x, y: el.y, width: el.width ?? 0, height: el.height ?? 0 };
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
    case 'line':
      return { ...base, points: [0, 0, 0, 0] };
    case 'freehand':
      return { ...base, points: [0, 0] };
    default:
      return { ...base, width: 0, height: 0, fill: s.fill ?? '#FFFFFF' };
  }
}
