/**
 * templates-drawer.tsx — slide-over drawer listing board templates (M5-Task1).
 *
 * Mirrors comments-panel.tsx / version-history-panel.tsx for structure and
 * styling. Clicking a template inserts it at the supplied viewport-center
 * point and closes the drawer.
 */

import type { CanvasStore } from '../engine/canvas-store';
import { ALL_TEMPLATES } from '../model/templates';

// Emoji glyphs that give a quick visual hint for each template.
const TEMPLATE_GLYPHS: Record<string, string> = {
  retro: '🔄',
  kanban: '📋',
  flowchart: '⬥',
  mindmap: '🧠',
  'user-story-map': '🗺',
};

interface Props {
  store: CanvasStore;
  open: boolean;
  onClose: () => void;
  /** Canvas coordinate where the template should be inserted (viewport center). */
  insertOrigin: { x: number; y: number };
}

export function TemplatesDrawer({ store, open, onClose, insertOrigin }: Props): JSX.Element | null {
  const s = store.getState();

  if (!open) return null;

  return (
    <aside
      className="fixed right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-line bg-raised shadow-xl dark:border-line-dark dark:bg-raised-dark"
      role="dialog"
      aria-label="Board templates"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-line-dark">
        <h2 className="font-display text-sm font-semibold text-ink dark:text-ink-dark">
          Templates
        </h2>
        <button
          onClick={onClose}
          aria-label="Close templates drawer"
          className="rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          ✕
        </button>
      </header>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-3 px-2 text-xs text-ink-400 dark:text-ink-dark">
          Click a template to insert it at the centre of your canvas.
        </p>
        <ul className="flex flex-col gap-2" role="list">
          {ALL_TEMPLATES.map((tmpl) => (
            <li key={tmpl.id}>
              <button
                onClick={() => {
                  s.insertTemplate(tmpl.id, insertOrigin);
                  onClose();
                }}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-sunken dark:hover:bg-sunken-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={`Insert ${tmpl.name} template`}
              >
                <span className="mt-0.5 text-xl" aria-hidden="true">
                  {TEMPLATE_GLYPHS[tmpl.id] ?? '□'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink dark:text-ink-dark">{tmpl.name}</p>
                  <p className="mt-0.5 text-xs text-ink-400 dark:text-ink-dark">{tmpl.description}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
