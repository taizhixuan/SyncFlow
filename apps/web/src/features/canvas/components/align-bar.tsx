import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';
import type { AlignAxis, DistributeAxis } from '../model/align';

const ALIGNS: { axis: AlignAxis; label: string; glyph: string }[] = [
  { axis: 'left', label: 'Align left', glyph: '⊢' },
  { axis: 'centerX', label: 'Align center', glyph: '↔' },
  { axis: 'right', label: 'Align right', glyph: '⊣' },
  { axis: 'top', label: 'Align top', glyph: '⊤' },
  { axis: 'middleY', label: 'Align middle', glyph: '↕' },
  { axis: 'bottom', label: 'Align bottom', glyph: '⊥' },
];
const DISTS: { axis: DistributeAxis; label: string; glyph: string }[] = [
  { axis: 'horizontal', label: 'Distribute horizontally', glyph: '⇿' },
  { axis: 'vertical', label: 'Distribute vertically', glyph: '⇳' },
];

export function AlignBar({ store }: { store: CanvasStore }): JSX.Element | null {
  const selected = useStore(store, (s) => s.selected);
  const s = store.getState();
  if (selected.length < 2) return null;

  const btn = 'grid h-8 w-8 place-items-center rounded text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark';
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-raised p-1 shadow-raised dark:border-line-dark dark:bg-raised-dark">
      {ALIGNS.map((a) => (
        <button key={a.axis} className={btn} title={a.label} aria-label={a.label} onClick={() => s.alignSelection(a.axis)}>
          <span aria-hidden="true">{a.glyph}</span>
        </button>
      ))}
      {selected.length >= 3 && (
        <>
          <div className="mx-1 h-5 w-px bg-line dark:bg-line-dark" />
          {DISTS.map((d) => (
            <button key={d.axis} className={btn} title={d.label} aria-label={d.label} onClick={() => s.distributeSelection(d.axis)}>
              <span aria-hidden="true">{d.glyph}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
