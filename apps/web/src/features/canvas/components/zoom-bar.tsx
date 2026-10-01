import { Maximize, Minus, Plus } from 'lucide-react';
import { useStore } from 'zustand';
import { zoomAtPoint } from '../engine/viewport';
import { boardBounds } from '../model/minimap';
import { viewportForBounds } from '../model/presentation';
import type { CanvasStore } from '../engine/canvas-store';

const STEP =
  'grid h-9 w-9 place-items-center rounded text-ink-400 md:h-6 md:w-6 hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/**
 * Inline zoom controls for the editor's status bar. Zooming pivots on the
 * centre of the stage; the percentage resets to 100% and Fit frames every
 * element on the board.
 */
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
    <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
      <button aria-label="Zoom out" onClick={() => s.setView(zoomAtPoint(view, center, 1 / 1.2))} className={STEP}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <button
        aria-label="Reset zoom to 100%"
        title="Reset to 100%"
        onClick={() => s.setView(zoomAtPoint(view, center, 1 / view.scale))}
        className="h-9 w-12 rounded text-center font-mono md:h-6 text-[11px] text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {Math.round(view.scale * 100)}%
      </button>
      <button aria-label="Zoom in" onClick={() => s.setView(zoomAtPoint(view, center, 1.2))} className={STEP}>
        <Plus size={14} aria-hidden="true" />
      </button>
      <button
        aria-label="Zoom to fit"
        title="Fit the whole board"
        onClick={() => {
          const els = Object.values(s.doc.elements);
          if (els.length) s.setView(viewportForBounds(boardBounds(els), size));
        }}
        className={STEP}
      >
        <Maximize size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
