import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search, type LucideIcon } from 'lucide-react';
import { useDialogFocus } from '@/hooks/use-dialog-focus';

export interface Command {
  id: string;
  label: string;
  group: string;
  Icon: LucideIcon;
  /** Shown as a key hint; display only. */
  shortcut?: string;
  /** Extra words that should match (e.g. "dark" for the theme toggle). */
  keywords?: string;
  run: () => void;
}

/** Case-insensitive match on every whitespace-separated term, in any order. */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...commands];
  return commands.filter((c) => {
    const hay = `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Opens the palette on ⌘K / Ctrl+K from anywhere on the page. */
export function useCommandPaletteHotkey(open: () => void): void {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // Browsers bind Ctrl+K to the address bar; the board owns it here.
        e.preventDefault();
        openRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Keyboard-first launcher for every editor action: tools, panels, view and
 * board commands. Arrow keys move, Enter runs, Escape closes.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: readonly Command[];
}): JSX.Element | null {
  if (!open) return null;
  return createPortal(<PaletteDialog onClose={onClose} commands={commands} />, document.body);
}

function PaletteDialog({ onClose, commands }: { onClose: () => void; commands: readonly Command[] }): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  useDialogFocus(panelRef, { onClose, trap: true });

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const run = (cmd: Command | undefined): void => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  // Group headings are rendered inline, in result order.
  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[min(520px,70vh)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-float"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-ink-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (results.length ? (i + 1) % results.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[active]);
              }
            }}
            placeholder="Search tools, panels and actions…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-400 focus:outline-none"
          />
          <kbd>esc</kbd>
        </div>

        <ul ref={listRef} id={listId} role="listbox" aria-label="Commands" className="flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-ink-400">No commands match “{query}”.</li>
          )}
          {results.map((cmd, i) => {
            const heading = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            const selected = i === active;
            return (
              <li key={cmd.id} role="presentation">
                {heading && (
                  <div className="px-2.5 pb-1 pt-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">
                    {heading}
                  </div>
                )}
                <div
                  id={`${listId}-${cmd.id}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(cmd)}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm ${
                    selected ? 'bg-sunken text-ink' : 'text-ink-600'
                  }`}
                >
                  <cmd.Icon size={16} strokeWidth={1.8} className={selected ? 'text-brand' : 'text-ink-400'} aria-hidden="true" />
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
                  {selected && <CornerDownLeft size={13} className="text-ink-400" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
