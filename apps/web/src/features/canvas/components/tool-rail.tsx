import { Fragment, useState } from 'react';
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
import { VIEWER_TOOLS, type CanvasStore, type ToolId } from '../engine/canvas-store';

interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  Icon: LucideIcon;
}

/** Grouped so the rail reads as navigate / draw / content / present. */
export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', label: 'Select', shortcut: 'V', Icon: MousePointer2 },
    { id: 'pan', label: 'Pan', shortcut: 'H', Icon: Hand },
  ],
  [
    { id: 'rect', label: 'Rectangle', shortcut: 'R', Icon: Square },
    { id: 'ellipse', label: 'Ellipse', shortcut: 'O', Icon: Circle },
    { id: 'diamond', label: 'Diamond', shortcut: 'D', Icon: Diamond },
    { id: 'triangle', label: 'Triangle', shortcut: 'G', Icon: Triangle },
    { id: 'star', label: 'Star', shortcut: 'M', Icon: Star },
    { id: 'line', label: 'Line', shortcut: 'L', Icon: Minus },
    { id: 'connector', label: 'Connector', shortcut: 'C', Icon: Spline },
    { id: 'freehand', label: 'Pen', shortcut: 'P', Icon: Pencil },
  ],
  [
    { id: 'sticky', label: 'Sticky note', shortcut: 'S', Icon: StickyNote },
    { id: 'text', label: 'Text', shortcut: 'T', Icon: Type },
    { id: 'code', label: 'Code block', shortcut: 'K', Icon: Code2 },
    { id: 'image', label: 'Image', shortcut: 'I', Icon: ImageIcon },
    { id: 'frame', label: 'Frame', shortcut: 'F', Icon: Frame },
    { id: 'mindnode', label: 'Mind node', shortcut: 'N', Icon: Network },
  ],
  [{ id: 'laser', label: 'Laser pointer', shortcut: 'Q', Icon: Sparkles }],
];

/**
 * The drawing tools. On md+ it is a docked column beside the canvas; on small
 * screens it collapses behind a floating toggle so it never blocks the board.
 */
export function ToolRail({ store }: { store: CanvasStore }): JSX.Element {
  const tool = useStore(store, (s) => s.tool);
  const readOnly = useStore(store, (s) => s.readOnly);
  const s = store.getState();
  const groups = (readOnly ? TOOL_GROUPS.map((g) => g.filter((t) => VIEWER_TOOLS.has(t.id))) : TOOL_GROUPS).filter(
    (g) => g.length > 0,
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute left-3 top-3 z-20 flex flex-col gap-1 md:static md:z-auto md:h-full md:w-14 md:shrink-0 md:border-r md:border-line md:bg-chrome">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Hide tools' : 'Show tools'}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-raised text-ink-600 shadow-float md:hidden"
      >
        {open ? <X size={20} aria-hidden="true" /> : <Shapes size={20} aria-hidden="true" />}
      </button>

      <div
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="vertical"
        className={`${open ? 'flex' : 'hidden'} max-h-[calc(100dvh-8rem)] flex-col items-center gap-0.5 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-float md:flex md:max-h-none md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-2 md:shadow-none`}
      >
        {groups.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <span aria-hidden="true" className="my-1.5 h-px w-6 shrink-0 bg-line" />}
            {group.map((t) => {
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    s.setTool(t.id);
                    setOpen(false); // tuck the rail away after picking a tool on mobile
                  }}
                  aria-label={`${t.label} (${t.shortcut})`}
                  aria-pressed={active}
                  title={`${t.label} (${t.shortcut})`}
                  className={`group relative grid h-10 w-10 shrink-0 place-items-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    active
                      ? 'bg-accent/15 text-brand ring-1 ring-inset ring-brand/40'
                      : 'text-ink-400 hover:bg-sunken hover:text-ink'
                  }`}
                >
                  <t.Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[8px] leading-none text-ink-400 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {t.shortcut}
                  </span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
