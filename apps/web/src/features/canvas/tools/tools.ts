import type { CanvasElement, ElementType } from '@syncflow/shared';
import { createElement } from '../model/element';
import { addElements, removeElements } from '../model/commands';
import type { Tool, ToolCtx } from './tool';
import type { ToolId } from '../engine/canvas-store';

// Drag-to-size shapes: a box defined by width/height (vs line/freehand points).
const BOX_DRAW_TYPES = new Set<ElementType>(['rect', 'ellipse', 'frame', 'diamond', 'triangle', 'star']);

interface Draft {
  el: CanvasElement;
  type: ElementType;
  start: { x: number; y: number };
  w: number;
  h: number;
  points: number[];
}
let draft: Draft | null = null;

function nextZ(ctx: ToolCtx): number {
  const zs = Object.values(ctx.store.doc.elements).map((e) => e.zIndex);
  return zs.length ? Math.max(...zs) + 1 : 0;
}

function makeDrawTool(type: ElementType): Tool {
  return {
    id: type as ToolId,
    cursor: 'crosshair',
    // A whole gesture is ONE undoable command: transient updates while dragging,
    // a single addElements committed on release (so one undo removes the shape).
    onDown(ctx, target) {
      if (target !== 'stage') return;
      const p = ctx.getCanvasPoint();
      const el = createElement(type, p, nextZ(ctx), ctx.store.activeStyle);
      ctx.store.applyTransient(addElements([el]));
      draft = { el, type, start: p, w: 0, h: 0, points: el.points ? [...el.points] : [] };
    },
    onMove(ctx) {
      if (!draft) return;
      const p = ctx.getCanvasPoint();
      let patch: Partial<CanvasElement> = {};
      if (BOX_DRAW_TYPES.has(type)) {
        draft.w = Math.abs(p.x - draft.start.x);
        draft.h = Math.abs(p.y - draft.start.y);
        patch = { x: Math.min(draft.start.x, p.x), y: Math.min(draft.start.y, p.y), width: draft.w, height: draft.h };
      } else if (type === 'line') {
        patch = { points: [0, 0, p.x - draft.start.x, p.y - draft.start.y] };
      } else if (type === 'freehand') {
        draft.points.push(p.x - draft.start.x, p.y - draft.start.y);
        patch = { points: [...draft.points] };
      }
      draft.el = { ...draft.el, ...patch };
      // Re-apply the full draft element each move. The transient overlay holds a
      // single command and the draft isn't committed to Yjs yet, so an
      // updateElements here would no-op against the (empty) base and the live
      // preview would vanish mid-drag. addElements keeps the in-progress shape
      // visible while dragging.
      ctx.store.applyTransient(addElements([draft.el]));
    },
    onUp(ctx) {
      const d = draft;
      draft = null;
      if (!d) return;
      ctx.store.applyTransient(removeElements([d.el.id])); // clear the live preview
      const tooSmall = BOX_DRAW_TYPES.has(d.type) && (d.w < 4 || d.h < 4);
      if (!tooSmall) {
        ctx.store.dispatch(addElements([d.el])); // one undoable command
        ctx.store.setSelected([d.el.id]);
      }
      ctx.store.setTool('select');
    },
  };
}

function makePlaceTool(type: ElementType): Tool {
  return {
    id: type as ToolId,
    cursor: 'crosshair',
    onDown(ctx, target) {
      if (target !== 'stage') return;
      const el = createElement(type, ctx.getCanvasPoint(), nextZ(ctx), ctx.store.activeStyle);
      ctx.store.dispatch(addElements([el]));
      ctx.store.setSelected([el.id]);
      ctx.store.setTool('select');
    },
    onMove() {},
    onUp() {},
  };
}

const NOOP: Tool = { id: 'select', cursor: 'default', onDown() {}, onMove() {}, onUp() {} };
const PAN: Tool = { id: 'pan', cursor: 'grab', onDown() {}, onMove() {}, onUp() {} };

// Connector drawing is handled specially in the stage (needs element-under-pointer).
const CONNECTOR: Tool = { id: 'connector', cursor: 'crosshair', onDown() {}, onMove() {}, onUp() {} };

// Laser pointer — drawing is NOOP; broadcasting is handled in canvas-stage via awareness.
const LASER: Tool = { id: 'laser', cursor: 'crosshair', onDown() {}, onMove() {}, onUp() {} };

// Image — the file picker and click-to-place flow are handled in canvas-stage
// (it needs DOM + stage coordinates), so the tool itself is a no-op.
const IMAGE: Tool = { id: 'image', cursor: 'crosshair', onDown() {}, onMove() {}, onUp() {} };

const TOOLS: Record<ToolId, Tool> = {
  select: NOOP,
  pan: PAN,
  rect: makeDrawTool('rect'),
  ellipse: makeDrawTool('ellipse'),
  line: makeDrawTool('line'),
  freehand: makeDrawTool('freehand'),
  sticky: makePlaceTool('sticky'),
  text: makePlaceTool('text'),
  diamond: makeDrawTool('diamond'),
  triangle: makeDrawTool('triangle'),
  star: makeDrawTool('star'),
  connector: CONNECTOR,
  code: makePlaceTool('code'),
  frame: makeDrawTool('frame'),
  mindnode: makePlaceTool('mindnode'),
  image: IMAGE,
  laser: LASER,
};

export function getTool(id: ToolId): Tool {
  return TOOLS[id];
}
