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
  /**
   * Abandon a gesture already in progress without committing it — used when a
   * second finger lands and the gesture turns out to be a pinch, not a draw.
   */
  onCancel?(ctx: ToolCtx): void;
}
