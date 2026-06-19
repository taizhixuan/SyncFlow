import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import type { CanvasElement } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';

/** Element types that carry an editable text label and so accept font styling. */
export const TEXT_BEARING_TYPES: ReadonlySet<string> = new Set([
  'text',
  'sticky',
  'rect',
  'ellipse',
  'diamond',
  'triangle',
  'star',
  'code',
  'mindnode',
]);

/** Selectable font families. Values are the exact CSS stacks the renderer applies. */
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Sans', value: 'Inter' },
  { label: 'Display', value: 'Space Grotesk' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: '"JetBrains Mono", monospace' },
];

const SIZE_PRESETS = [12, 14, 16, 20, 24, 32, 48, 64];
/** Text color swatches; 'auto' clears the explicit color so the legible default returns. */
const TEXT_SWATCHES = ['auto', '#1A1A22', '#F4F4F2', ...PRESENCE_PALETTE];

function isBoldWeight(w: CanvasElement['fontWeight']): boolean {
  return w === 'bold' || (typeof w === 'number' && w >= 600);
}

/**
 * Font configuration panel. Opens from a toolbar trigger and writes font family,
 * size, weight, italic, alignment, and text color to every selected text-bearing
 * element via the synced `recolorSelection` path, so changes propagate to all
 * collaborators. Reflects the first selected element's current values.
 */
export function FontPopover({ store }: { store: CanvasStore }): JSX.Element | null {
  const selected = useStore(store, (s) => s.selected);
  const doc = useStore(store, (s) => s.doc);
  const s = store.getState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const textEls = selected
    .map((id) => doc.elements[id])
    .filter((el): el is CanvasElement => !!el && TEXT_BEARING_TYPES.has(el.type));

  // Only show the control when the selection actually has text to style.
  if (textEls.length === 0) return null;

  const first = textEls[0]!;
  const curFamily = first.fontFamily ?? 'Inter';
  const curSize = first.fontSize ?? 16;
  const bold = isBoldWeight(first.fontWeight);
  const italic = first.italic === true;
  const align = first.textAlign ?? (first.type === 'text' || first.type === 'sticky' ? 'left' : 'center');

  /** Apply a patch to every selected text element through the synced dispatch path. */
  const apply = (patch: Partial<CanvasElement>): void => s.recolorSelection(patch);

  const setSize = (n: number): void => {
    const clamped = Math.max(8, Math.min(200, Math.round(n)));
    s.setActiveStyle({ fontSize: clamped });
    apply({ fontSize: clamped });
  };

  const seg =
    'grid h-7 w-8 place-items-center rounded text-xs font-medium text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark';
  const segActive = 'bg-brand text-white hover:bg-brand';

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Text and font"
        aria-expanded={open}
        title="Text & font"
        className={`grid h-7 w-8 place-items-center rounded font-semibold ${
          open ? 'bg-sunken dark:bg-sunken-dark' : ''
        } text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark`}
      >
        <span aria-hidden="true" className="text-sm">
          A<span className="text-[10px]">a</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-lg border border-line bg-raised p-3 shadow-float dark:border-line-dark dark:bg-raised-dark">
          {/* Family */}
          <label className="mb-1 block text-[11px] font-medium text-ink-400">Font</label>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {FONT_FAMILIES.map((f) => (
              <button
                key={f.value}
                onClick={() => apply({ fontFamily: f.value })}
                aria-pressed={curFamily === f.value}
                className={`rounded px-2 py-1 text-xs ${
                  curFamily === f.value
                    ? 'bg-brand text-white'
                    : 'text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark'
                }`}
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Size */}
          <label className="mb-1 block text-[11px] font-medium text-ink-400">Size</label>
          <div className="mb-3 flex items-center gap-1">
            <button onClick={() => setSize(curSize - 2)} aria-label="Decrease font size" className={seg}>
              −
            </button>
            <input
              type="number"
              value={curSize}
              min={8}
              max={200}
              onChange={(e) => setSize(Number(e.target.value))}
              aria-label="Font size"
              className="w-12 rounded border border-line bg-paper px-1.5 py-0.5 text-center text-xs text-ink dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark"
            />
            <button onClick={() => setSize(curSize + 2)} aria-label="Increase font size" className={seg}>
              +
            </button>
            <select
              value=""
              onChange={(e) => e.target.value && setSize(Number(e.target.value))}
              aria-label="Size presets"
              className="ml-1 rounded border border-line bg-paper px-1 py-0.5 text-xs text-ink-600 dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark"
            >
              <option value="">·</option>
              {SIZE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Weight / style / align */}
          <label className="mb-1 block text-[11px] font-medium text-ink-400">Style</label>
          <div className="mb-3 flex items-center gap-1">
            <button
              onClick={() => apply({ fontWeight: bold ? 'normal' : 'bold' })}
              aria-label="Bold"
              aria-pressed={bold}
              className={`${seg} ${bold ? segActive : ''} font-bold`}
            >
              B
            </button>
            <button
              onClick={() => apply({ italic: !italic })}
              aria-label="Italic"
              aria-pressed={italic}
              className={`${seg} ${italic ? segActive : ''} italic`}
            >
              I
            </button>
            <div className="mx-1 h-5 w-px bg-line dark:bg-line-dark" />
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                onClick={() => apply({ textAlign: a })}
                aria-label={`Align ${a}`}
                aria-pressed={align === a}
                className={`${seg} ${align === a ? segActive : ''}`}
              >
                <span aria-hidden="true">{a === 'left' ? '⬅' : a === 'center' ? '⬌' : '➡'}</span>
              </button>
            ))}
          </div>

          {/* Text color */}
          <label className="mb-1 block text-[11px] font-medium text-ink-400">Text color</label>
          <div className="flex flex-wrap items-center gap-1">
            {TEXT_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => apply({ textColor: c })}
                aria-label={`Text color ${c}`}
                aria-pressed={first.textColor === c || (c === 'auto' && !first.textColor)}
                className={`h-5 w-5 rounded-full border ${
                  first.textColor === c || (c === 'auto' && !first.textColor)
                    ? 'ring-2 ring-brand'
                    : 'border-line dark:border-line-dark'
                }`}
                style={{
                  background: c === 'auto' ? 'conic-gradient(#1A1A22 0 50%, #F4F4F2 50% 100%)' : c,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
