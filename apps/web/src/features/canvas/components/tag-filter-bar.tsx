/**
 * tag-filter-bar.tsx — Board-wide tag filter + cluster panel (M4-Task3).
 *
 * Lists all tags in the document with counts.
 * Clicking a tag sets the activeTagFilter (local UI state) — matching elements
 * render at full opacity; non-matching elements are dimmed.
 * A "Cluster" button beside each tag calls clusterByTag.
 */
import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';
import { allTags, tagCounts } from '../model/tags';

export function TagFilterBar({ store }: { store: CanvasStore }): JSX.Element {
  const doc = useStore(store, (s) => s.doc);
  const activeTagFilter = useStore(store, (s) => s.activeTagFilter);
  const s = store.getState();

  const els = Object.values(doc.elements);
  const counts = tagCounts(els);

  if (counts.length === 0) {
    return (
      <div
        role="region"
        aria-label="Tag filters"
        className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-xs text-ink-400 shadow-raised dark:border-line-dark dark:bg-raised-dark dark:text-ink-dark"
      >
        <span aria-live="polite">No tags yet</span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Tag filters"
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-raised px-2 py-1.5 shadow-raised dark:border-line-dark dark:bg-raised-dark"
    >
      {activeTagFilter !== null && (
        <button
          onClick={() => s.setActiveTagFilter(null)}
          aria-label="Clear tag filter"
          title="Clear filter"
          className="rounded px-2 py-0.5 text-xs font-medium text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          ✕ Clear
        </button>
      )}

      {counts.map(({ tag, count }) => {
        const isActive = activeTagFilter === tag;
        return (
          <span key={tag} className="flex items-center gap-0.5">
            <button
              onClick={() => s.setActiveTagFilter(isActive ? null : tag)}
              aria-pressed={isActive}
              aria-label={`Filter by tag ${tag} (${count})`}
              title={isActive ? `Clear filter: ${tag}` : `Filter by: ${tag}`}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-brand text-white'
                  : 'bg-sunken text-ink-600 hover:bg-brand/20 dark:bg-sunken-dark dark:text-ink-dark'
              }`}
            >
              <span>{tag}</span>
              <span
                className={`rounded-full px-1 text-[10px] ${isActive ? 'bg-white/20' : 'bg-line dark:bg-line-dark'}`}
              >
                {count}
              </span>
            </button>
            <button
              onClick={() => s.clusterByTag(tag)}
              aria-label={`Cluster elements by tag ${tag}`}
              title={`Cluster by: ${tag}`}
              className="rounded px-1 py-0.5 text-[10px] text-ink-400 hover:bg-sunken hover:text-ink dark:text-ink-dark dark:hover:bg-sunken-dark"
            >
              ⊞
            </button>
          </span>
        );
      })}
    </div>
  );
}
