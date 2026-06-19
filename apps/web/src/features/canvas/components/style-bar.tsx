import { useStore } from 'zustand';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';

const SWATCHES = ['auto', ...PRESENCE_PALETTE];

export function StyleBar({ store }: { store: CanvasStore }): JSX.Element {
  const selected = useStore(store, (s) => s.selected);
  const active = useStore(store, (s) => s.activeStyle);
  const s = store.getState();

  const pick = (color: string): void => {
    s.setActiveStyle({ stroke: color });
    if (selected.length) s.recolorSelection({ stroke: color });
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-raised p-1 shadow-raised dark:border-line-dark dark:bg-raised-dark">
      {SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => pick(c)}
          aria-label={`Color ${c}`}
          aria-pressed={active.stroke === c}
          className={`h-6 w-6 rounded-full border ${
            active.stroke === c ? 'ring-2 ring-brand' : 'border-line dark:border-line-dark'
          }`}
          style={{
            background:
              c === 'auto' ? 'conic-gradient(#1A1A22 0 50%, #F4F4F2 50% 100%)' : c,
          }}
        />
      ))}
    </div>
  );
}
