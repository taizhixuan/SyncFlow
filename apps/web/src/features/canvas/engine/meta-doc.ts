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
import { z } from 'zod';

/** Timer state stored in ydoc.getMap('meta') under key 'timer'. */
export interface TimerState {
  running: boolean;
  /**
   * When the run ends. In the DOC this is on the starter's wall clock and is
   * only used to tell runs apart; the store's projection rewrites it onto the
   * local clock (see localizeTimer) before anything counts down from it.
   */
  endsAt: number | null;
  /** Time left when the current run started (or when it was paused). */
  remainingMs: number;
  durationMs: number;
}

const timerSchema = z.object({
  running: z.boolean(),
  endsAt: z.number().nullable(),
  remainingMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
});

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

let warnedInvalidTimer = false;

export function getTimer(meta: YMeta): TimerState {
  const raw = meta.get('timer');
  if (raw === undefined) return { ...DEFAULT_TIMER };
  const parsed = timerSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Written by a peer; a garbage value must not break the timer panel.
  if (!warnedInvalidTimer) {
    warnedInvalidTimer = true;
    console.warn('[meta] ignoring invalid timer state', parsed.error.issues);
  }
  return { ...DEFAULT_TIMER };
}

/** When this client first saw the current run start, on its own clock. */
export interface TimerObservation {
  run: string;
  at: number;
}

/**
 * Re-base a running timer onto this client's clock.
 *
 * `endsAt` in the doc is the starter's `Date.now()`. Counting down against it
 * on another machine bakes the clock difference into the display — a peer
 * whose clock runs a minute fast sees "time's up" a minute early. Instead each
 * client counts `remainingMs` from the moment IT observed the run start, so
 * only network latency separates peers. The trade-off: a client that joins
 * mid-run sees the run from its join, since it cannot know how long ago the
 * start happened without trusting the starter's clock.
 */
export function localizeTimer(
  state: TimerState,
  observation: TimerObservation | null,
  now: number,
): { timer: TimerState; observation: TimerObservation | null } {
  if (!state.running) return { timer: state, observation: null };
  const run = `${state.endsAt ?? 'none'}|${state.remainingMs}`;
  const obs = observation?.run === run ? observation : { run, at: now };
  return { timer: { ...state, endsAt: obs.at + state.remainingMs }, observation: obs };
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
