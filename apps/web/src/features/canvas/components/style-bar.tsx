import { useStore } from 'zustand';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';
import type { CanvasElement } from '@syncflow/shared';

const SWATCHES = ['auto', ...PRESENCE_PALETTE];
const WIDTHS: { w: number; label: string }[] = [
  { w: 1, label: 'Thin' },
  { w: 2, label: 'Medium' },
  { w: 4, label: 'Thick' },
];
const DASHES: { s: 'solid' | 'dashed' | 'dotted'; glyph: string }[] = [
  { s: 'solid', glyph: '──' },
  { s: 'dashed', glyph: '╌╌' },
  { s: 'dotted', glyph: '┄┄' },
];

export function StyleBar({ store }: { store: CanvasStore }): JSX.Element {
  const selected = useStore(store, (s) => s.selected);
  const active = useStore(store, (s) => s.activeStyle);
  const doc = useStore(store, (s) => s.doc);
  const s = store.getState();

  /** All selected elements that are text type. */
  const selectedTextEls: CanvasElement[] = selected
    .map((id) => doc.elements[id])
    .filter((el): el is CanvasElement => el?.type === 'text');

  /** True when at least one selected text element has markdown enabled. */
  const markdownActive = selectedTextEls.length > 0 && selectedTextEls.every((el) => el.markdown === true);

  const toggleMarkdown = (): void => {
    if (selectedTextEls.length === 0) return;
    const nextMarkdown = !markdownActive;
    s.recolorSelection({ markdown: nextMarkdown });
  };

  const applyColor = (color: string): void => {
    s.setActiveStyle({ stroke: color });
    if (selected.length) s.recolorSelection({ stroke: color });
  };
  const applyWidth = (w: number): void => {
    s.setActiveStyle({ strokeWidth: w });
    if (selected.length) s.recolorSelection({ strokeWidth: w });
  };
  const applyDash = (style: 'solid' | 'dashed' | 'dotted'): void => {
    s.setActiveStyle({ strokeStyle: style });
    if (selected.length) s.recolorSelection({ strokeStyle: style });
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-raised p-1.5 shadow-raised dark:border-line-dark dark:bg-raised-dark">
      <div className="flex items-center gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => applyColor(c)}
            aria-label={`Color ${c}`}
            aria-pressed={active.stroke === c}
            className={`h-5 w-5 rounded-full border ${active.stroke === c ? 'ring-2 ring-brand' : 'border-line dark:border-line-dark'}`}
            style={{ background: c === 'auto' ? 'conic-gradient(#1A1A22 0 50%, #F4F4F2 50% 100%)' : c }}
          />
        ))}
      </div>

      <div className="h-5 w-px bg-line dark:bg-line-dark" />

      <div className="flex items-center gap-0.5">
        {WIDTHS.map((x) => (
          <button
            key={x.w}
            onClick={() => applyWidth(x.w)}
            aria-label={`Stroke ${x.label}`}
            aria-pressed={active.strokeWidth === x.w}
            className={`grid h-7 w-7 place-items-center rounded ${active.strokeWidth === x.w ? 'bg-sunken dark:bg-sunken-dark' : ''} hover:bg-sunken dark:hover:bg-sunken-dark`}
          >
            <span className="rounded-full bg-ink dark:bg-ink-dark" style={{ width: 16, height: x.w }} />
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-line dark:bg-line-dark" />

      <div className="flex items-center gap-0.5">
        {DASHES.map((d) => (
          <button
            key={d.s}
            onClick={() => applyDash(d.s)}
            aria-label={`Stroke ${d.s}`}
            aria-pressed={active.strokeStyle === d.s}
            className={`grid h-7 w-8 place-items-center rounded font-mono text-xs text-ink-600 dark:text-ink-dark ${active.strokeStyle === d.s ? 'bg-sunken dark:bg-sunken-dark' : ''} hover:bg-sunken dark:hover:bg-sunken-dark`}
          >
            <span aria-hidden="true">{d.glyph}</span>
          </button>
        ))}
      </div>

      {selectedTextEls.length > 0 && (
        <>
          <div className="h-5 w-px bg-line dark:bg-line-dark" />
          <button
            onClick={toggleMarkdown}
            aria-label="Toggle markdown rendering"
            aria-pressed={markdownActive}
            title="Render as Markdown"
            className={`grid h-7 w-8 place-items-center rounded font-mono text-xs ${markdownActive ? 'bg-brand text-white' : 'text-ink-600 dark:text-ink-dark hover:bg-sunken dark:hover:bg-sunken-dark'}`}
          >
            <span aria-hidden="true">M↓</span>
          </button>
        </>
      )}
    </div>
  );
}
