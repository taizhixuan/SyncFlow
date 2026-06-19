import type { ElementType } from '@syncflow/shared';
import { createElement } from '../model/element';
import { addElements, removeElements, updateElements } from '../model/commands';
import type { Tool, ToolCtx } from './tool';
import type { ToolId } from '../engine/canvas-store';

interface Draft {
  id: string;
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
    onDown(ctx, target) {
      if (target !== 'stage') return;
      const p = ctx.getCanvasPoint();
      const el = createElement(type, p, nextZ(ctx), ctx.store.activeStyle);
      ctx.store.dispatch(addElements([el]));
      draft = { id: el.id, type, start: p, w: 0, h: 0, points: el.points ? [...el.points] : [] };
    },
    onMove(ctx) {
      if (!draft) return;
      const p = ctx.getCanvasPoint();
      if (type === 'rect' || type === 'ellipse') {
        draft.w = Math.abs(p.x - draft.start.x);
        draft.h = Math.abs(p.y - draft.start.y);
        ctx.store.dispatch(
          updateElements({
            [draft.id]: {
              x: Math.min(draft.start.x, p.x),
              y: Math.min(draft.start.y, p.y),
              width: draft.w,
              height: draft.h,
            },
          }),
        );
      } else if (type === 'line') {
        ctx.store.dispatch(
          updateElements({ [draft.id]: { points: [0, 0, p.x - draft.start.x, p.y - draft.start.y] } }),
        );
      } else if (type === 'freehand') {
        draft.points.push(p.x - draft.start.x, p.y - draft.start.y);
        ctx.store.dispatch(updateElements({ [draft.id]: { points: [...draft.points] } }));
      }
    },
    onUp(ctx) {
      const d = draft;
      draft = null;
      if (!d) return;
      const tooSmall = (d.type === 'rect' || d.type === 'ellipse') && (d.w < 4 || d.h < 4);
      if (tooSmall) ctx.store.dispatch(removeElements([d.id]));
      else ctx.store.setSelected([d.id]);
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

const TOOLS: Record<ToolId, Tool> = {
  select: NOOP,
  pan: PAN,
  rect: makeDrawTool('rect'),
  ellipse: makeDrawTool('ellipse'),
  line: makeDrawTool('line'),
  freehand: makeDrawTool('freehand'),
  sticky: makePlaceTool('sticky'),
  text: makePlaceTool('text'),
};

export function getTool(id: ToolId): Tool {
  return TOOLS[id];
}
