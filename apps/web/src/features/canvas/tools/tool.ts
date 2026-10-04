import type { CanvasState, ToolId } from '../engine/canvas-store';

export interface ToolCtx {
  store: CanvasState;
  getCanvasPoint(): { x: number; y: number };
  /** Open the inline text editor on an element (used right after placing text). */
  startEditing?(id: string): void;
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
