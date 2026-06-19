import { useState } from 'react';
import { useStore } from 'zustand';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import type { CanvasStore } from '../engine/canvas-store';
import type { CanvasElement } from '@syncflow/shared';
import { allTags } from '../model/tags';
import { FontPopover, TEXT_BEARING_TYPES } from './font-popover';

/** Fixed emoji set — no extra dependency needed. */
const REACTION_EMOJIS = ['👍', '❤️', '🎉', '🤔', '👀'] as const;

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

export function StyleBar({ store, userId }: { store: CanvasStore; userId?: string }): JSX.Element {
  const selected = useStore(store, (s) => s.selected);
  const active = useStore(store, (s) => s.activeStyle);
  const doc = useStore(store, (s) => s.doc);
  const s = store.getState();
  const [tagInput, setTagInput] = useState('');

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

  /** Union of tags on all selected elements (for the chip display). */
  const selectedEls = selected.map((id) => doc.elements[id]).filter((el): el is CanvasElement => !!el);
  const selectionTags = selected.length > 0 ? allTags(selectedEls) : [];

  /** Whether any selected element carries a text label (drives the font control). */
  const hasTextSelection = selectedEls.some((el) => TEXT_BEARING_TYPES.has(el.type));

  const commitTagInput = (): void => {
    const t = tagInput.trim();
    if (!t) return;
    s.addTagToSelection(t);
    setTagInput('');
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

      {hasTextSelection && (
        <>
          <div className="h-5 w-px bg-line dark:bg-line-dark" />
          <FontPopover store={store} />
        </>
      )}

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

      {/* Emoji reaction picker — shown when at least one element is selected and we have a userId. */}
      {selected.length > 0 && userId && (
        <>
          <div className="h-5 w-px bg-line dark:bg-line-dark" />
          <div className="flex items-center gap-0.5">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  for (const id of selected) s.reactElement(id, emoji, userId);
                }}
                aria-label={`React with ${emoji}`}
                title={`React ${emoji}`}
                className="grid h-7 w-7 place-items-center rounded text-base hover:bg-sunken dark:hover:bg-sunken-dark"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Tag editor — shown when at least one element is selected. */}
      {selected.length > 0 && (
        <>
          <div className="h-5 w-px bg-line dark:bg-line-dark" />
          <div className="flex items-center gap-1" role="group" aria-label="Element tags">
            {/* Existing tag chips */}
            {selectionTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand dark:bg-brand/20"
              >
                {tag}
                <button
                  onClick={() => s.removeTagFromSelection(tag)}
                  aria-label={`Remove tag ${tag}`}
                  title={`Remove tag: ${tag}`}
                  className="ml-0.5 rounded-full text-[10px] hover:text-red-500"
                >
                  ✕
                </button>
              </span>
            ))}
            {/* Tag input */}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTagInput();
                }
                if (e.key === 'Escape') setTagInput('');
              }}
              placeholder="+ tag"
              aria-label="Add tag to selected elements"
              className="w-14 rounded border border-line bg-transparent px-1.5 py-0.5 text-xs text-ink-600 placeholder-ink-300 outline-none focus:border-brand dark:border-line-dark dark:text-ink-dark"
            />
          </div>
        </>
      )}
    </div>
  );
}
