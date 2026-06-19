import { useStore } from 'zustand';
import { zoomAtPoint } from '../engine/viewport';
import type { CanvasStore } from '../engine/canvas-store';

export function ZoomBar({
  store,
  size,
}: {
  store: CanvasStore;
  size: { width: number; height: number };
}): JSX.Element {
  const view = useStore(store, (s) => s.view);
  const s = store.getState();
  const center = { x: size.width / 2, y: size.height / 2 };
  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-md border border-line bg-raised p-1 shadow-raised dark:border-line-dark dark:bg-raised-dark">
      <button
        aria-label="Zoom out"
        onClick={() => s.setView(zoomAtPoint(view, center, 1 / 1.2))}
        className="h-7 w-7 rounded text-ink-600 hover:bg-sunken dark:text-ink-dark"
      >
        −
      </button>
      <span className="w-12 text-center font-mono text-xs text-ink-600 dark:text-ink-dark">
        {Math.round(view.scale * 100)}%
      </span>
      <button
        aria-label="Zoom in"
        onClick={() => s.setView(zoomAtPoint(view, center, 1.2))}
        className="h-7 w-7 rounded text-ink-600 hover:bg-sunken dark:text-ink-dark"
      >
        +
      </button>
    </div>
  );
}
