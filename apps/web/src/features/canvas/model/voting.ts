/**
 * voting.ts — Pure tally helpers for dot-voting and emoji reactions (M4).
 *
 * These functions are all pure (no mutations, no side effects).
 * Store actions in canvas-store.ts call these helpers and dispatch
 * updateElements with the resulting values — syncing for free via the
 * existing flat per-field Yjs binding.
 */

import type { CanvasElement } from '@syncflow/shared';

// ── Vote tallying ─────────────────────────────────────────────────────────────

/** Sum of all user vote counts for an element. */
export function totalVotes(el: CanvasElement): number {
  if (!el.votes) return 0;
  return Object.values(el.votes).reduce((sum, count) => sum + count, 0);
}

/** How many dots the given user has placed on this element. */
export function myVotes(el: CanvasElement, userId: string): number {
  return el.votes?.[userId] ?? 0;
}

/**
 * Return a new votes record with `delta` applied to `userId`.
 * Clamps at 0; removes the key when count reaches 0.
 * Pure: does not mutate `votes`.
 */
export function addVote(
  votes: Record<string, number>,
  userId: string,
  delta: number,
): Record<string, number> {
  const current = votes[userId] ?? 0;
  const next = Math.max(0, current + delta);
  const result = { ...votes };
  if (next === 0) {
    delete result[userId];
  } else {
    result[userId] = next;
  }
  return result;
}

// ── Reaction helpers ──────────────────────────────────────────────────────────

/**
 * Toggle `userId`'s reaction on `emoji`.
 * Adds the user if absent; removes them if already present.
 * Drops the emoji key when no users remain.
 * Pure: does not mutate `reactions`.
 */
export function toggleReaction(
  reactions: Record<string, string[]>,
  emoji: string,
  userId: string,
): Record<string, string[]> {
  const current = reactions[emoji] ?? [];
  const has = current.includes(userId);
  const next = has ? current.filter((u) => u !== userId) : [...current, userId];
  const result = { ...reactions };
  if (next.length === 0) {
    delete result[emoji];
  } else {
    result[emoji] = next;
  }
  return result;
}

/** Summary of reactions for an element, sorted by count descending. */
export function reactionSummary(el: CanvasElement): { emoji: string; count: number }[] {
  if (!el.reactions) return [];
  return Object.entries(el.reactions)
    .map(([emoji, users]) => ({ emoji, count: users.length }))
    .sort((a, b) => b.count - a.count);
}

// ── Sorting / highlighting ────────────────────────────────────────────────────

/**
 * Return a copy of `els` sorted by total votes descending.
 * Elements with equal votes maintain their original relative order (stable).
 * Pure: does not mutate `els`.
 */
export function sortByVotes(els: CanvasElement[]): CanvasElement[] {
  return [...els].sort((a, b) => totalVotes(b) - totalVotes(a));
}

/**
 * Return the ids of the top `n` elements by vote count.
 * Only includes elements that have at least one vote.
 * If `n` is omitted, returns all elements with at least one vote.
 */
export function topVotedIds(els: CanvasElement[], n?: number): string[] {
  const withVotes = els.filter((e) => totalVotes(e) > 0);
  const sorted = sortByVotes(withVotes);
  const slice = n !== undefined ? sorted.slice(0, n) : sorted;
  return slice.map((e) => e.id);
}
