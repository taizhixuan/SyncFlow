import type { CanvasState, ToolId } from '../engine/canvas-store';

export interface ToolCtx {
  store: CanvasState;
  getCanvasPoint(): { x: number; y: number };
}

export interface Tool {
  id: ToolId;
  cursor: string;
  onDown(ctx: ToolCtx, target: 'stage' | 'element'): void;
  onMove(ctx: ToolCtx): void;
  onUp(ctx: ToolCtx): void;
}
