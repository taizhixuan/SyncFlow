/**
 * tags.ts — Pure tag helpers for element tagging (M4-Task3).
 *
 * All functions are pure (no mutations, no side effects).
 * Store actions in canvas-store.ts call these helpers and dispatch
 * updateElements with the resulting values — syncing for free via the
 * existing flat per-field Yjs binding.
 */

import type { CanvasElement } from '@syncflow/shared';

/**
 * Collect all unique, non-empty tags across a list of elements, sorted alphabetically.
 */
export function allTags(els: CanvasElement[]): string[] {
  const set = new Set<string>();
  for (const el of els) {
    for (const tag of el.tags ?? []) {
      const t = tag.trim();
      if (t) set.add(t);
    }
  }
  return Array.from(set).sort();
}

/**
 * Return elements that include the given tag in their tags array.
 */
export function elementsWithTag(els: CanvasElement[], tag: string): CanvasElement[] {
  return els.filter((el) => el.tags?.includes(tag) ?? false);
}

/**
 * Return tag counts sorted descending by count; ties broken alphabetically by tag name.
 */
export function tagCounts(els: CanvasElement[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const el of els) {
    for (const tag of el.tags ?? []) {
      const t = tag.trim();
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Return a new tags array with `tag` added (trimmed, deduplicated).
 * Ignores blank strings. Pure — does not mutate the input.
 */
export function addTag(tags: string[], tag: string): string[] {
  const t = tag.trim();
  if (!t) return tags;
  if (tags.includes(t)) return tags;
  return [...tags, t];
}

/**
 * Return a new tags array with `tag` removed.
 * Idempotent — does nothing if tag is absent. Pure.
 */
export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}
