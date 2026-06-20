import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';
import type { AlignAxis, DistributeAxis } from '../model/align';

const ALIGNS: { axis: AlignAxis; label: string; Icon: LucideIcon }[] = [
  { axis: 'left', label: 'Align left', Icon: AlignStartVertical },
  { axis: 'centerX', label: 'Align center', Icon: AlignCenterVertical },
  { axis: 'right', label: 'Align right', Icon: AlignEndVertical },
  { axis: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { axis: 'middleY', label: 'Align middle', Icon: AlignCenterHorizontal },
  { axis: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];
const DISTS: { axis: DistributeAxis; label: string; Icon: LucideIcon }[] = [
  { axis: 'horizontal', label: 'Distribute horizontally', Icon: AlignHorizontalDistributeCenter },
  { axis: 'vertical', label: 'Distribute vertically', Icon: AlignVerticalDistributeCenter },
];

export function AlignBar({ store }: { store: CanvasStore }): JSX.Element | null {
  const selected = useStore(store, (s) => s.selected);
  const s = store.getState();
  if (selected.length < 2) return null;

  const btn =
    'grid h-8 w-8 place-items-center rounded text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark';
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-raised p-1 shadow-raised dark:border-line-dark dark:bg-raised-dark">
      {ALIGNS.map((a) => (
        <button key={a.axis} className={btn} title={a.label} aria-label={a.label} onClick={() => s.alignSelection(a.axis)}>
          <a.Icon size={16} aria-hidden="true" />
        </button>
      ))}
      {selected.length >= 3 && (
        <>
          <div className="mx-1 h-5 w-px bg-line dark:bg-line-dark" />
          {DISTS.map((d) => (
            <button key={d.axis} className={btn} title={d.label} aria-label={d.label} onClick={() => s.distributeSelection(d.axis)}>
              <d.Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </>
      )}
    </div>
  );
}
