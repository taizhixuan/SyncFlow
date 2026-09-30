/**
 * meta-doc.ts — helpers for the `ydoc.getMap('meta')` slice.
 *
 * The timer state is a shared CRDT value stored under key 'timer' in this map.
 * All clients project the same timer state; any mutation is broadcast to peers.
 *
 * Timer instants are on the SERVER clock (local Date.now() + the offset the
 * sync provider measured), so every client counts down to the same moment no
 * matter how wrong its own clock is, and a late joiner sees the true remaining
 * time. Timers written before this were stamped with the starter's wall clock;
 * they have the same shape and are read as server time, which is exactly as
 * accurate as that starter's clock was.
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
  /** When the current run ends, on the server clock. Null while paused. */
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

/**
 * Time left on the timer at `serverNow` (server-clock ms). A paused timer
 * holds its frozen `remainingMs`; a running one counts down to `endsAt`.
 */
export function timerRemainingMs(state: TimerState, serverNow: number): number {
  if (!state.running || state.endsAt === null) return state.remainingMs;
  return Math.max(0, state.endsAt - serverNow);
}

/** Pure transition: start (or resume) the timer. `now` is server time. */
export function applyStartTimer(state: TimerState, now: number): TimerState {
  return {
    ...state,
    running: true,
    endsAt: now + state.remainingMs,
  };
}

/** Pure transition: pause the timer, freezing remaining time. `now` is server time. */
export function applyPauseTimer(state: TimerState, now: number): TimerState {
  if (!state.running) return state;
  return {
    ...state,
    running: false,
    endsAt: null,
    remainingMs: timerRemainingMs(state, now),
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
