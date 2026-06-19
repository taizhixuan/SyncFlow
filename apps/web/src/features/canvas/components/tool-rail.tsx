import { useStore } from 'zustand';
import type { CanvasStore, ToolId } from '../engine/canvas-store';

const TOOLS: { id: ToolId; label: string; shortcut: string; glyph: string }[] = [
  { id: 'select', label: 'Select', shortcut: 'V', glyph: '⌖' },
  { id: 'pan', label: 'Pan', shortcut: 'H', glyph: '✋' },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', glyph: '▭' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', glyph: '◯' },
  { id: 'diamond', label: 'Diamond', shortcut: 'D', glyph: '◇' },
  { id: 'triangle', label: 'Triangle', shortcut: 'G', glyph: '△' },
  { id: 'star', label: 'Star', shortcut: 'M', glyph: '☆' },
  { id: 'line', label: 'Line', shortcut: 'L', glyph: '╱' },
  { id: 'connector', label: 'Connector', shortcut: 'C', glyph: '⟶' },
  { id: 'freehand', label: 'Pen', shortcut: 'P', glyph: '✎' },
  { id: 'sticky', label: 'Sticky note', shortcut: 'S', glyph: '▤' },
  { id: 'text', label: 'Text', shortcut: 'T', glyph: 'T' },
];

export function ToolRail({ store }: { store: CanvasStore }): JSX.Element {
  const tool = useStore(store, (s) => s.tool);
  const s = store.getState();
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
      className="flex flex-col gap-1 rounded-lg border border-line bg-raised p-1 shadow-raised dark:border-line-dark dark:bg-raised-dark"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => s.setTool(t.id)}
          aria-label={`${t.label} (${t.shortcut})`}
          aria-pressed={tool === t.id}
          title={`${t.label} (${t.shortcut})`}
          className={`grid h-9 w-9 place-items-center rounded-md text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            tool === t.id ? 'bg-brand text-white' : 'text-ink-600 hover:bg-sunken dark:text-ink-dark'
          }`}
        >
          <span aria-hidden="true">{t.glyph}</span>
        </button>
      ))}
    </div>
  );
}
