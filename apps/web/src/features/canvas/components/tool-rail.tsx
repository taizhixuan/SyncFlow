import { useState } from 'react';
import { useStore } from 'zustand';
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Diamond,
  Triangle,
  Star,
  Minus,
  Spline,
  Pencil,
  StickyNote,
  Type,
  Code2,
  Image as ImageIcon,
  Frame,
  Network,
  Sparkles,
  Shapes,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CanvasStore, ToolId } from '../engine/canvas-store';

const TOOLS: { id: ToolId; label: string; shortcut: string; Icon: LucideIcon }[] = [
  { id: 'select', label: 'Select', shortcut: 'V', Icon: MousePointer2 },
  { id: 'pan', label: 'Pan', shortcut: 'H', Icon: Hand },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', Icon: Circle },
  { id: 'diamond', label: 'Diamond', shortcut: 'D', Icon: Diamond },
  { id: 'triangle', label: 'Triangle', shortcut: 'G', Icon: Triangle },
  { id: 'star', label: 'Star', shortcut: 'M', Icon: Star },
  { id: 'line', label: 'Line', shortcut: 'L', Icon: Minus },
  { id: 'connector', label: 'Connector', shortcut: 'C', Icon: Spline },
  { id: 'freehand', label: 'Pen', shortcut: 'P', Icon: Pencil },
  { id: 'sticky', label: 'Sticky note', shortcut: 'S', Icon: StickyNote },
  { id: 'text', label: 'Text', shortcut: 'T', Icon: Type },
  { id: 'code', label: 'Code block', shortcut: 'K', Icon: Code2 },
  { id: 'image', label: 'Image', shortcut: 'I', Icon: ImageIcon },
  { id: 'frame', label: 'Frame', shortcut: 'F', Icon: Frame },
  { id: 'mindnode', label: 'Mind node', shortcut: 'N', Icon: Network },
  { id: 'laser', label: 'Laser pointer', shortcut: 'Q', Icon: Sparkles },
];

export function ToolRail({ store }: { store: CanvasStore }): JSX.Element {
  const tool = useStore(store, (s) => s.tool);
  const s = store.getState();
  // On small screens the rail collapses behind a toggle so it never blocks the
  // board. On md+ the rail is always shown and the toggle is hidden.
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Hide tools' : 'Show tools'}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-raised text-ink-600 shadow-raised md:hidden dark:border-line-dark dark:bg-raised-dark dark:text-ink-dark"
      >
        {open ? <X size={20} aria-hidden="true" /> : <Shapes size={20} aria-hidden="true" />}
      </button>

      <div
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="vertical"
        className={`${open ? 'flex' : 'hidden'} max-h-[calc(100dvh-7rem)] flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-raised md:flex dark:border-line-dark dark:bg-raised-dark`}
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              s.setTool(t.id);
              setOpen(false); // tuck the rail away after picking a tool on mobile
            }}
            aria-label={`${t.label} (${t.shortcut})`}
            aria-pressed={tool === t.id}
            title={`${t.label} (${t.shortcut})`}
            className={`grid h-9 w-9 place-items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              tool === t.id ? 'bg-brand text-white' : 'text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark'
            }`}
          >
            <t.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
