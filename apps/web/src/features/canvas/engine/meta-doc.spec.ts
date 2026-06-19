import { describe, it, expect } from 'vitest';
import { applyStartTimer, applyPauseTimer, applyResetTimer, type TimerState } from './meta-doc';

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
