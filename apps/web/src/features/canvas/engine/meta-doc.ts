/**
 * meta-doc.ts — helpers for the `ydoc.getMap('meta')` slice.
 *
 * The timer state is a shared CRDT value stored under key 'timer' in this map.
 * All clients project the same timer state; any mutation is broadcast to peers.
 *
 * Timer writes use META_ORIGIN so:
 *  - NOT LOCAL_ORIGIN → not tracked by UndoManager (timer is not undoable)
 *  - NOT REMOTE_ORIGIN → socket provider broadcasts them to peers
 */

import * as Y from 'yjs';

/** Timer state stored in ydoc.getMap('meta') under key 'timer'. */
export interface TimerState {
  running: boolean;
  endsAt: number | null;
  remainingMs: number;
  durationMs: number;
}

export const DEFAULT_TIMER: TimerState = {
  running: false,
  endsAt: null,
  remainingMs: 5 * 60 * 1000,
  durationMs: 5 * 60 * 1000,
};

/** Distinct origin for meta (timer) mutations — not LOCAL_ORIGIN (not undoable)
 *  and not REMOTE_ORIGIN (socket provider broadcasts them). */
export const META_ORIGIN = Symbol('meta');

export type YMeta = Y.Map<unknown>;

export function getMetaMap(ydoc: Y.Doc): YMeta {
  return ydoc.getMap<unknown>('meta');
}

export function getTimer(meta: YMeta): TimerState {
  const t = meta.get('timer') as TimerState | undefined;
  return t ?? { ...DEFAULT_TIMER };
}

/** Pure transition: start (or resume) the timer. */
export function applyStartTimer(state: TimerState, now: number): TimerState {
  return {
    ...state,
    running: true,
    endsAt: now + state.remainingMs,
  };
}

/** Pure transition: pause the timer, freezing remaining time. */
export function applyPauseTimer(state: TimerState, now: number): TimerState {
  if (!state.running) return state;
  const remaining = Math.max(0, (state.endsAt ?? now) - now);
  return {
    ...state,
    running: false,
    endsAt: null,
    remainingMs: remaining,
  };
}

/** Pure transition: reset the timer to durationMs (or a new duration). */
export function applyResetTimer(state: TimerState, newDurationMs?: number): TimerState {
  const d = newDurationMs ?? state.durationMs;
  return {
    running: false,
    endsAt: null,
    remainingMs: d,
    durationMs: d,
  };
}
