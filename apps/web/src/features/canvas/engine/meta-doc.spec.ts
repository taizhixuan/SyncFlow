import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import * as Y from 'yjs';
import {
  applyStartTimer,
  applyPauseTimer,
  applyResetTimer,
  getMetaMap,
  getTimer,
  localizeTimer,
  type TimerState,
} from './meta-doc';

// Timer transitions are pure functions — inject `now` for deterministic tests.

describe('meta-doc timer transitions', () => {
  const base: TimerState = {
    running: false,
    endsAt: null,
    remainingMs: 300_000,
    durationMs: 300_000,
  };

  it('startTimer sets running=true and computes endsAt from now+remainingMs', () => {
    const now = 1000;
    const next = applyStartTimer(base, now);
    expect(next.running).toBe(true);
    expect(next.endsAt).toBe(now + base.remainingMs);
    expect(next.durationMs).toBe(base.durationMs);
  });

  it('startTimer on already-running timer resets endsAt from now+remainingMs', () => {
    const running: TimerState = {
      running: true,
      endsAt: 9999,
      remainingMs: 200_000,
      durationMs: 300_000,
    };
    const next = applyStartTimer(running, 5000);
    expect(next.running).toBe(true);
    expect(next.endsAt).toBe(5000 + 200_000);
  });

  it('pauseTimer sets running=false and freezes remaining', () => {
    const running: TimerState = {
      running: true,
      endsAt: 10_000,
      remainingMs: 0,
      durationMs: 300_000,
    };
    const now = 7_000; // 3000ms left until endsAt
    const next = applyPauseTimer(running, now);
    expect(next.running).toBe(false);
    expect(next.remainingMs).toBe(3_000);
    expect(next.endsAt).toBeNull();
  });

  it('pauseTimer on already-paused is a no-op', () => {
    const paused: TimerState = {
      running: false,
      endsAt: null,
      remainingMs: 100_000,
      durationMs: 300_000,
    };
    const next = applyPauseTimer(paused, 9999);
    expect(next).toEqual(paused);
  });

  it('resetTimer restores durationMs and clears running/endsAt', () => {
    const running: TimerState = {
      running: true,
      endsAt: 99999,
      remainingMs: 50_000,
      durationMs: 300_000,
    };
    const next = applyResetTimer(running);
    expect(next.running).toBe(false);
    expect(next.endsAt).toBeNull();
    expect(next.remainingMs).toBe(300_000);
    expect(next.durationMs).toBe(300_000);
  });

  it('resetTimer with a new durationMs updates both remainingMs and durationMs', () => {
    const paused: TimerState = {
      running: false,
      endsAt: null,
      remainingMs: 10_000,
      durationMs: 300_000,
    };
    const next = applyResetTimer(paused, 600_000);
    expect(next.durationMs).toBe(600_000);
    expect(next.remainingMs).toBe(600_000);
  });
});

describe('timer across skewed clocks', () => {
  const paused: TimerState = { running: false, endsAt: null, remainingMs: 60_000, durationMs: 60_000 };

  it('a peer whose clock runs a minute fast still sees the full countdown', () => {
    const started = applyStartTimer(paused, 1_000_000); // starter's clock
    const peerNow = 1_000_000 + 60_000 + 50; // peer clock +60 s, 50 ms latency
    const { timer } = localizeTimer(started, null, peerNow);
    expect(timer.endsAt! - peerNow).toBe(60_000);
  });

  it('keeps the first observation of a run instead of restarting on every projection', () => {
    const started = applyStartTimer(paused, 5_000);
    const first = localizeTimer(started, null, 10_000);
    const again = localizeTimer(started, first.observation, 40_000);
    expect(again.timer.endsAt).toBe(10_000 + 60_000);
  });

  it('a new start is a new run', () => {
    const run1 = applyStartTimer(paused, 5_000);
    const obs = localizeTimer(run1, null, 5_000).observation;
    const run2 = applyStartTimer({ ...paused, remainingMs: 30_000 }, 90_000);
    const { timer } = localizeTimer(run2, obs, 90_010);
    expect(timer.endsAt).toBe(90_010 + 30_000);
  });

  it('passes a paused timer through untouched', () => {
    expect(localizeTimer(paused, null, 123).timer).toEqual(paused);
  });
});

describe('getTimer validation', () => {
  it('falls back to the default for a malformed timer value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const meta = getMetaMap(new Y.Doc());
    meta.set('timer', { running: 'yes', remainingMs: 'soon' });
    const t = getTimer(meta);
    expect(t.running).toBe(false);
    expect(typeof t.remainingMs).toBe('number');
    warn.mockRestore();
  });
});
