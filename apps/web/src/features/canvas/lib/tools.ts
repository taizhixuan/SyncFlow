import type { CanvasElement, ElementType } from '@syncflow/shared';

export type ToolId = 'select' | 'pan' | ElementType;

export interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  glyph: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', shortcut: 'V', glyph: '⌖' },
  { id: 'pan', label: 'Pan', shortcut: 'H', glyph: '✋' },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', glyph: '▭' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', glyph: '◯' },
  { id: 'line', label: 'Line', shortcut: 'L', glyph: '╱' },
  { id: 'freehand', label: 'Pen', shortcut: 'P', glyph: '✎' },
  { id: 'sticky', label: 'Sticky note', shortcut: 'S', glyph: '▤' },
  { id: 'text', label: 'Text', shortcut: 'T', glyph: 'T' },
];

/** Element types that resize as a box (Transformer-driven). */
export const BOX_TYPES: ElementType[] = ['rect', 'ellipse', 'sticky', 'text'];

const STICKY_FILL = '#FFEFB0';
const DEFAULT_STROKE = '#1A1A22';

/** Create a freshly-started element at a point; size/points fill in as the user drags. */
export function createDraft(
  type: ElementType,
  point: { x: number; y: number },
  zIndex: number,
  createdBy?: string,
): CanvasElement {
  const base: CanvasElement = {
    id: crypto.randomUUID(),
    type,
    x: point.x,
    y: point.y,
    rotation: 0,
    opacity: 1,
    zIndex,
    fill: null,
    stroke: DEFAULT_STROKE,
    strokeWidth: 2,
    createdBy,
  };

  switch (type) {
    case 'rect':
      return { ...base, width: 0, height: 0, fill: '#FFFFFF' };
    case 'ellipse':
      return { ...base, width: 0, height: 0, fill: '#FFFFFF' };
    case 'sticky':
      return { ...base, width: 160, height: 120, fill: STICKY_FILL, stroke: '#E8D27A', text: '', fontSize: 16 };
    case 'text':
      return { ...base, width: 200, height: 28, fill: null, stroke: '#1A1A22', strokeWidth: 0, text: 'Text', fontSize: 20 };
    case 'line':
      return { ...base, points: [0, 0, 0, 0] };
    case 'freehand':
      return { ...base, points: [0, 0] };
  }
}
