import type { CanvasElement, ElementType } from '@syncflow/shared';
import { createElement } from '../model/element';
import { addElements, removeElements, updateElements } from '../model/commands';
import type { Tool, ToolCtx } from './tool';
import type { ToolId } from '../engine/canvas-store';

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
      if (type === 'rect' || type === 'ellipse') {
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
      ctx.store.applyTransient(updateElements({ [draft.el.id]: patch }));
    },
    onUp(ctx) {
      const d = draft;
      draft = null;
      if (!d) return;
      ctx.store.applyTransient(removeElements([d.el.id])); // clear the live preview
      const tooSmall = (d.type === 'rect' || d.type === 'ellipse') && (d.w < 4 || d.h < 4);
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
};

export function getTool(id: ToolId): Tool {
  return TOOLS[id];
}
