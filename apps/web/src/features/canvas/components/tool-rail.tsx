import { Fragment } from 'react';
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
  Undo2,
  Redo2,
  type LucideIcon,
} from 'lucide-react';
import { useIsPhone } from '@/hooks/use-media-query';
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
 * The drawing tools. On md+ it is a docked column beside the canvas; on a phone
 * it becomes a bottom dock in the thumb zone, one horizontally scrolling row,
 * led by undo/redo because a phone has no keyboard for Ctrl+Z.
 */
export function ToolRail({ store }: { store: CanvasStore }): JSX.Element {
  const tool = useStore(store, (s) => s.tool);
  const readOnly = useStore(store, (s) => s.readOnly);
  const isPhone = useIsPhone();
  const s = store.getState();
  const groups = (readOnly ? TOOL_GROUPS.map((g) => g.filter((t) => VIEWER_TOOLS.has(t.id))) : TOOL_GROUPS).filter(
    (g) => g.length > 0,
  );

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 pb-[env(safe-area-inset-bottom)] md:static md:inset-auto md:z-auto md:h-full md:w-14 md:shrink-0 md:border-r md:border-line md:bg-chrome md:pb-0">
      <div
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation={isPhone ? 'horizontal' : 'vertical'}
        className="flex items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-raised p-1 shadow-float [scrollbar-width:none] md:h-full md:flex-col md:overflow-y-auto md:overflow-x-hidden md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-2 md:shadow-none"
      >
        {isPhone && !readOnly && (
          <>
            <button
              onClick={() => s.undo()}
              aria-label="Undo"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-400 active:bg-sunken"
            >
              <Undo2 size={19} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              onClick={() => s.redo()}
              aria-label="Redo"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-400 active:bg-sunken"
            >
              <Redo2 size={19} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line" />
          </>
        )}
        {groups.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && (
              <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line md:mx-0 md:my-1.5 md:h-px md:w-6" />
            )}
            {group.map((t) => {
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => s.setTool(t.id)}
                  aria-label={`${t.label} (${t.shortcut})`}
                  aria-pressed={active}
                  title={`${t.label} (${t.shortcut})`}
                  className={`group relative grid h-11 w-11 shrink-0 place-items-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10 md:w-10 ${
                    active
                      ? 'bg-accent/15 text-brand ring-1 ring-inset ring-brand/40'
                      : 'text-ink-400 hover:bg-sunken hover:text-ink'
                  }`}
                >
                  <t.Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0.5 right-1 hidden font-mono text-[8px] leading-none text-ink-400 opacity-0 transition-opacity group-hover:opacity-100 md:block"
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
