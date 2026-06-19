import { useState } from 'react';
import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';

interface Props {
  store: CanvasStore;
  open: boolean;
  onClose: () => void;
  /** Canvas coordinate where an instance should be inserted (viewport center). */
  insertOrigin: { x: number; y: number };
}

export function ComponentLibrary({ store, open, onClose, insertOrigin }: Props): JSX.Element | null {
  const components = useStore(store, (s) => s.components);
  const selected = useStore(store, (s) => s.selected);
  const s = store.getState();
  const [nameInput, setNameInput] = useState('');

  if (!open) return null;

  const hasSelection = selected.length > 0;

  return (
    <aside
      className="fixed right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-line bg-raised shadow-xl dark:border-line-dark dark:bg-raised-dark"
      role="dialog"
      aria-label="Component library"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line-dark">
        <h2 className="font-display text-sm font-semibold text-ink dark:text-ink-dark">
          Component Library
          {components.length > 0 && (
            <span className="ml-2 rounded-full bg-sunken px-1.5 py-0.5 text-[11px] font-normal text-ink-400 dark:bg-sunken-dark">
              {components.length}
            </span>
          )}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close component library"
          className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          ✕
        </button>
      </header>

      {/* Save selection section */}
      <div className="border-b border-line px-4 py-3 dark:border-line-dark">
        <p className="mb-2 text-xs text-ink-400 dark:text-ink-dark">
          {hasSelection
            ? `Save ${selected.length} selected element${selected.length === 1 ? '' : 's'} as a component:`
            : 'Select elements on the canvas to save as a component.'}
        </p>
        {hasSelection && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = nameInput.trim();
              if (!trimmed) return;
              s.saveSelectionAsComponent(trimmed);
              setNameInput('');
            }}
          >
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Component name…"
              aria-label="Component name"
              className="min-w-0 flex-1 rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-brand dark:border-line-dark dark:bg-sunken-dark dark:text-ink-dark"
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="rounded-md border border-line px-2 py-1 text-xs text-ink-600 hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40 dark:border-line-dark dark:text-ink-dark dark:hover:bg-sunken-dark"
            >
              Save
            </button>
          </form>
        )}
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {components.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-ink-400 dark:text-ink-dark">
            No saved components yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {components.map((comp) => (
              <li
                key={comp.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-sunken dark:hover:bg-sunken-dark"
              >
                <button
                  onClick={() => {
                    s.insertComponent(comp, insertOrigin);
                    onClose();
                  }}
                  className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={`Insert ${comp.name} component`}
                >
                  <span className="truncate text-sm font-semibold text-ink dark:text-ink-dark">
                    {comp.name}
                  </span>
                  <span className="text-xs text-ink-400 dark:text-ink-dark">
                    {comp.elements.length} element{comp.elements.length === 1 ? '' : 's'}
                  </span>
                </button>
                <button
                  onClick={() => s.deleteComponent(comp.id)}
                  aria-label={`Delete ${comp.name} component`}
                  title="Delete component"
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-danger hover:bg-raised dark:hover:bg-raised-dark"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
