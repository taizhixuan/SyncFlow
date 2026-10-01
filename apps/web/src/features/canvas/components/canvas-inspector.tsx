import { useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Lock,
  PanelRightClose,
  Trash2,
  Unlock,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CanvasElement } from '@syncflow/shared';
import { useAuth } from '@/features/auth/auth-context';
import { usePresence } from '@/features/presence/use-presence';
import type { CanvasStore } from '../engine/canvas-store';
import { removeElements, updateElements } from '../model/commands';
import { isBoxType } from '../model/element';
import { descendantIds } from '../model/mindmap';
import { allTags } from '../model/tags';
import { SURFACE } from '../model/colors';
import { FontPopover, TEXT_BEARING_TYPES } from './font-popover';
import { DASHES, REACTION_EMOJIS, SWATCHES, WIDTHS } from './style-bar';

const TYPE_LABEL: Record<string, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  triangle: 'Triangle',
  star: 'Star',
  line: 'Line',
  freehand: 'Drawing',
  sticky: 'Sticky note',
  text: 'Text',
  code: 'Code block',
  image: 'Image',
  frame: 'Frame',
  mindnode: 'Mind node',
  embed: 'Link card',
};

/** Types whose body takes a fill (lines, drawings and text have none). */
const FILLABLE = new Set(['rect', 'ellipse', 'diamond', 'triangle', 'star', 'sticky', 'frame', 'mindnode']);

/** null = no fill; SURFACE follows the theme; the rest are literal. */
const FILLS: (string | null)[] = [
  null,
  SURFACE,
  '#FFEFB0',
  '#FFD6E0',
  '#CFF5E1',
  '#D6E4FF',
  '#E6E0FF',
  '#3B5BFF',
  '#FF5A5F',
  '#12B5A5',
  '#8B5CF6',
];

const FIELD_NAME: Record<string, string> = { X: 'X position', Y: 'Y position', W: 'Width', H: 'Height' };

const SWATCH =
  'h-6 w-6 shrink-0 rounded-md border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const SWATCH_ON = 'ring-2 ring-brand ring-offset-2 ring-offset-chrome';

/**
 * The editor's right-hand inspector (lg and up): what is selected, its style,
 * its exact geometry, arrange actions, tags, and who else is on the board.
 * With nothing selected the style controls set the next shape you draw.
 */
export function CanvasInspector({
  store,
  awareness,
  onOpenComments,
  onOpenHistory,
  onHide,
}: {
  store: CanvasStore;
  awareness?: Awareness;
  onOpenComments: () => void;
  onOpenHistory?: () => void;
  /** Collapses the inspector to give the canvas the full width. */
  onHide?: () => void;
}): JSX.Element {
  const selected = useStore(store, (s) => s.selected);
  const doc = useStore(store, (s) => s.doc);
  const active = useStore(store, (s) => s.activeStyle);
  const readOnly = useStore(store, (s) => s.readOnly);
  const { user } = useAuth();
  const s = store.getState();

  const els = selected.map((id) => doc.elements[id]).filter((el): el is CanvasElement => !!el);
  const sole = els.length === 1 ? els[0] : undefined;
  const title =
    els.length === 0 ? (readOnly ? 'Nothing selected' : 'Next shape') : sole ? (TYPE_LABEL[sole.type] ?? 'Element') : `${els.length} elements`;
  // A single selection shows its own style; otherwise the defaults for new shapes.
  const stroke = sole?.stroke ?? active.stroke;
  const fill = sole ? sole.fill : active.fill;
  const strokeWidth = sole?.strokeWidth ?? active.strokeWidth;
  const strokeStyle = sole?.strokeStyle ?? active.strokeStyle;
  const showFill = els.length === 0 || els.some((el) => FILLABLE.has(el.type));
  const hasText = els.some((el) => TEXT_BEARING_TYPES.has(el.type));
  const textEls = els.filter((el) => el.type === 'text');
  const markdownOn = textEls.length > 0 && textEls.every((el) => el.markdown === true);
  const locked = !!sole?.locked;

  const apply = (patch: { stroke?: string; fill?: string | null; strokeWidth?: number; strokeStyle?: 'solid' | 'dashed' | 'dotted' }): void => {
    s.setActiveStyle(patch);
    if (selected.length) s.recolorSelection(patch);
  };

  const deleteSelection = (): void => {
    const all = Object.values(s.doc.elements);
    const mindNodes = all.filter((e) => e.type === 'mindnode');
    const ids = new Set(selected);
    for (const id of selected) {
      if (s.doc.elements[id]?.type === 'mindnode') for (const d of descendantIds(id, mindNodes)) ids.add(d);
    }
    // Locked means protected from edits, as with the keyboard and the context menu.
    const unlocked = [...ids].filter((id) => !s.doc.elements[id]?.locked);
    if (unlocked.length) s.dispatch(removeElements(unlocked));
    s.setSelected([]);
  };

  return (
    <aside
      aria-label="Inspector"
      className="fixed bottom-8 right-0 top-[52px] z-20 hidden w-[280px] flex-col border-l border-line bg-chrome lg:flex"
    >
      <div className="flex items-center gap-1 border-b border-line p-2">
        <div role="tablist" aria-label="Inspector views" className="flex flex-1 gap-1">
          <InspectorTab selected>Design</InspectorTab>
          <InspectorTab onClick={onOpenComments}>Comments</InspectorTab>
          {onOpenHistory && <InspectorTab onClick={onOpenHistory}>History</InspectorTab>}
        </div>
        {onHide && (
          <button
            onClick={onHide}
            aria-label="Hide inspector"
            title="Hide inspector"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <PanelRightClose size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {els.length > 0 && <span className="font-mono text-[11px] text-ink-400">{els.length} selected</span>}
        </div>

        {!readOnly && (
          <>
            <Section label="Stroke">
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => apply({ stroke: c })}
                    aria-label={`Stroke color ${c}`}
                    aria-pressed={stroke === c}
                    className={`${SWATCH} ${stroke === c ? SWATCH_ON : ''}`}
                    style={{ background: c === 'auto' ? 'conic-gradient(#1A1A22 0 50%, #F4F4F2 50% 100%)' : c }}
                  />
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Segmented>
                  {WIDTHS.map((x) => (
                    <SegButton
                      key={x.w}
                      label={`Stroke ${x.label}`}
                      on={strokeWidth === x.w}
                      onClick={() => apply({ strokeWidth: x.w })}
                    >
                      <span className="rounded-full bg-current" style={{ width: 16, height: x.w }} />
                    </SegButton>
                  ))}
                </Segmented>
                <Segmented>
                  {DASHES.map((d) => (
                    <SegButton key={d.s} label={`Stroke ${d.s}`} on={strokeStyle === d.s} onClick={() => apply({ strokeStyle: d.s })}>
                      <span className="block w-4 border-t-2 border-current" style={{ borderTopStyle: d.s }} />
                    </SegButton>
                  ))}
                </Segmented>
              </div>
            </Section>

            {showFill && (
              <Section label="Fill">
                <div className="flex flex-wrap gap-2">
                  {FILLS.map((f) => {
                    const on = (fill ?? null) === f;
                    const name = f === null ? 'none' : f === SURFACE ? 'surface' : f;
                    return (
                      <button
                        key={name}
                        onClick={() => apply({ fill: f })}
                        aria-label={`Fill ${name}`}
                        aria-pressed={on}
                        className={`${SWATCH} relative overflow-hidden ${on ? SWATCH_ON : ''} ${f === SURFACE ? 'bg-raised' : ''}`}
                        style={f && f !== SURFACE ? { background: f } : undefined}
                      >
                        {f === null && (
                          <span aria-hidden="true" className="absolute left-1/2 top-[-2px] h-[30px] w-px -translate-x-1/2 rotate-45 bg-danger" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {hasText && (
              <Section label="Text">
                <div className="flex items-center gap-2">
                  <FontPopover store={store} placement="left" />
                  {textEls.length > 0 && (
                    <button
                      onClick={() => s.recolorSelection({ markdown: !markdownOn })}
                      aria-label="Toggle markdown rendering"
                      aria-pressed={markdownOn}
                      className={`h-8 rounded-md border px-2.5 font-mono text-xs ${
                        markdownOn ? 'border-brand/40 bg-accent/15 text-brand' : 'border-line text-ink-600 hover:bg-sunken'
                      }`}
                    >
                      Markdown
                    </button>
                  )}
                </div>
              </Section>
            )}

            {sole && (
              <Section label="Layout">
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="X" value={sole.x} disabled={locked} onCommit={(x) => s.dispatch(updateElements({ [sole.id]: { x } }))} />
                  <NumberField label="Y" value={sole.y} disabled={locked} onCommit={(y) => s.dispatch(updateElements({ [sole.id]: { y } }))} />
                  {isBoxType(sole.type) && (
                    <>
                      <NumberField
                        label="W"
                        value={sole.width ?? 0}
                        min={4}
                        disabled={locked}
                        onCommit={(width) => s.dispatch(updateElements({ [sole.id]: { width } }))}
                      />
                      <NumberField
                        label="H"
                        value={sole.height ?? 0}
                        min={4}
                        disabled={locked}
                        onCommit={(height) => s.dispatch(updateElements({ [sole.id]: { height } }))}
                      />
                    </>
                  )}
                </div>
              </Section>
            )}

            {els.length > 0 && (
              <Section label="Arrange">
                <div className="flex gap-1">
                  <ActionButton Icon={Copy} label="Duplicate" onClick={() => s.duplicate(selected)} />
                  <ActionButton Icon={ArrowUpToLine} label="Bring to front" onClick={() => s.bringToFront(selected)} />
                  <ActionButton Icon={ArrowDownToLine} label="Send to back" onClick={() => s.sendToBack(selected)} />
                  <ActionButton
                    Icon={locked ? Unlock : Lock}
                    label={locked ? 'Unlock' : 'Lock'}
                    onClick={() => s.setLocked(selected, !locked)}
                  />
                  <ActionButton Icon={Trash2} label="Delete" danger onClick={deleteSelection} />
                </div>
              </Section>
            )}

            {els.length > 0 && <TagsSection store={store} els={els} userId={user?.id} />}
          </>
        )}

        {awareness && <LiveActivity awareness={awareness} store={store} />}
      </div>
    </aside>
  );
}

function InspectorTab({ selected = false, onClick, children }: { selected?: boolean; onClick?: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`h-7 flex-1 rounded-md text-xs font-medium transition-colors ${
        selected ? 'bg-sunken text-ink' : 'text-ink-400 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <section className="border-b border-line px-4 py-3.5">
      <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">{label}</h3>
      {children}
    </section>
  );
}

function Segmented({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-1 gap-0.5 rounded-md border border-line bg-paper p-0.5">{children}</div>;
}

function SegButton({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`grid h-7 flex-1 place-items-center rounded ${on ? 'bg-sunken text-ink' : 'text-ink-400 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  Icon,
  label,
  onClick,
  danger = false,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 flex-1 place-items-center rounded-md border border-line transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink-600 hover:bg-sunken hover:text-ink'
      }`}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

/**
 * A numeric field that commits on Enter or blur. It is keyed on the live value
 * so a remote edit (or a drag on the canvas) replaces whatever was typed.
 */
function NumberField({
  label,
  value,
  min,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}): JSX.Element {
  const rounded = Math.round(value);
  return <NumberInput key={rounded} label={label} initial={rounded} min={min} disabled={disabled} onCommit={onCommit} />;
}

function NumberInput({
  label,
  initial,
  min,
  disabled,
  onCommit,
}: {
  label: string;
  initial: number;
  min?: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(String(initial));
  const commit = (): void => {
    const n = Number(draft);
    if (!Number.isFinite(n) || draft.trim() === '') {
      setDraft(String(initial));
      return;
    }
    const next = min === undefined ? n : Math.max(min, n);
    if (next !== initial) onCommit(next);
  };
  return (
    <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-paper px-2.5 focus-within:border-brand">
      <span className="font-mono text-[11px] text-ink-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        aria-label={FIELD_NAME[label] ?? label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(String(initial));
            e.currentTarget.blur();
          }
        }}
        className="w-full min-w-0 bg-transparent font-mono text-xs text-ink [appearance:textfield] focus:outline-none disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none"
      />
    </label>
  );
}

function TagsSection({ store, els, userId }: { store: CanvasStore; els: CanvasElement[]; userId?: string }): JSX.Element {
  const s = store.getState();
  const [input, setInput] = useState('');
  const tags = allTags(els);
  const commit = (): void => {
    const t = input.trim();
    if (!t) return;
    s.addTagToSelection(t);
    setInput('');
  };
  return (
    <Section label="Tags & reactions">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Element tags">
        {tags.map((tag) => (
          <span key={tag} className="flex h-6 items-center gap-1 rounded-md border border-line bg-sunken px-2 text-xs text-ink-600">
            #{tag}
            <button
              onClick={() => s.removeTagFromSelection(tag)}
              aria-label={`Remove tag ${tag}`}
              className="grid place-items-center rounded text-ink-400 hover:text-danger"
            >
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') setInput('');
          }}
          placeholder="+ tag"
          aria-label="Add tag to selected elements"
          className="h-6 w-20 rounded-md border border-dashed border-line-strong bg-transparent px-2 text-xs text-ink placeholder:text-ink-400 focus:border-brand focus:outline-none"
        />
      </div>
      {userId && (
        <div className="mt-3 flex gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                for (const el of els) s.reactElement(el.id, emoji, userId);
              }}
              aria-label={`React with ${emoji}`}
              className="grid h-8 flex-1 place-items-center rounded-md border border-line text-base hover:bg-sunken"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Who else is on the board right now and what they are doing, from live presence. */
function LiveActivity({ awareness, store }: { awareness: Awareness; store: CanvasStore }): JSX.Element {
  const remotes = usePresence(awareness);
  const doc = useStore(store, (s) => s.doc);
  const now = Date.now();
  const describe = (r: (typeof remotes)[number]): string => {
    if (r.presenting) return 'is presenting';
    if (r.laser && now - r.laser.t < 3000) return 'is pointing with the laser';
    if (r.selection.length === 1) {
      const el = doc.elements[r.selection[0]!];
      return `selected ${el ? (TYPE_LABEL[el.type] ?? 'an element').toLowerCase() : 'an element'}`;
    }
    if (r.selection.length > 1) return `selected ${r.selection.length} elements`;
    return 'is viewing';
  };
  return (
    <section className="px-4 py-3.5">
      <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">Live activity</h3>
      {remotes.length === 0 ? (
        <p className="text-xs text-ink-400">Only you are here. Share the board to invite others.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {remotes.map((r) => (
            <li key={r.clientId} className="flex items-center gap-2 text-xs text-ink-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.user.color }} />
              <span className="min-w-0 flex-1 truncate">
                <b className="font-semibold text-ink">{r.user.name}</b> {describe(r)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
