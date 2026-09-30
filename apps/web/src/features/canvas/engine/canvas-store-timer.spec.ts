import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createCanvasStore, type CanvasStore } from './canvas-store';

// Server time is fixed at SERVER_T0; each client's wall clock is skewed from it
// and `clockOffsetMs` (server − local) is what the sync provider measured.
const SERVER_T0 = 10_000_000;
const MINUTE = 60_000;

function sync(from: CanvasStore, to: CanvasStore): void {
  to.getState().applyRemote(Y.encodeStateAsUpdate(from.getState().ydoc));
}

describe('canvas store — timer on server time', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('two clients with different local clocks but correct offsets show the same remaining time', () => {
    const a = createCanvasStore('board-a');
    const b = createCanvasStore('board-b');
    // a's clock is a minute slow, b's a minute fast.
    a.getState().setClockOffset(MINUTE);
    b.getState().setClockOffset(-MINUTE);

    vi.setSystemTime(SERVER_T0 - MINUTE); // a's local reading of server T0
    a.getState().startTimer();
    const full = a.getState().timer.durationMs;
    sync(a, b);

    vi.setSystemTime(SERVER_T0 - MINUTE + 15_000);
    const onA = a.getState().timerRemainingMs();
    vi.setSystemTime(SERVER_T0 + MINUTE + 15_000); // same server instant, b's clock
    const onB = b.getState().timerRemainingMs();
    expect(onA).toBe(full - 15_000);
    expect(onB).toBe(onA);
  });

  it('a client that joins mid-countdown sees the true remaining time, not the full duration', () => {
    const a = createCanvasStore('board-a');
    vi.setSystemTime(SERVER_T0);
    a.getState().startTimer();
    const full = a.getState().timer.durationMs;

    vi.setSystemTime(SERVER_T0 + 2 * MINUTE + 30_000); // b's clock is 30 s fast
    const b = createCanvasStore('board-b');
    b.getState().setClockOffset(-30_000);
    sync(a, b);
    expect(b.getState().timer.running).toBe(true);
    expect(b.getState().timerRemainingMs()).toBe(full - 2 * MINUTE);
  });

  it('pause freezes remaining time for everyone', () => {
    const a = createCanvasStore('board-a');
    const b = createCanvasStore('board-b');
    b.getState().setClockOffset(-MINUTE); // b runs a minute fast
    vi.setSystemTime(SERVER_T0);
    a.getState().startTimer();
    const full = a.getState().timer.durationMs;
    sync(a, b);

    // b pauses 10 s (server) into the run.
    vi.setSystemTime(SERVER_T0 + MINUTE + 10_000);
    b.getState().pauseTimer();
    expect(b.getState().timerRemainingMs()).toBe(full - 10_000);
    sync(b, a);

    vi.setSystemTime(SERVER_T0 + 5 * MINUTE);
    expect(a.getState().timer.running).toBe(false);
    expect(a.getState().timerRemainingMs()).toBe(full - 10_000);
    expect(b.getState().timerRemainingMs()).toBe(full - 10_000);
  });

  it('with offset 0 it behaves exactly as local time', () => {
    const a = createCanvasStore('board-a');
    expect(a.getState().clockOffsetMs).toBe(0);
    vi.setSystemTime(SERVER_T0);
    a.getState().startTimer();
    const full = a.getState().timer.durationMs;
    expect(a.getState().timer.endsAt).toBe(SERVER_T0 + full);
    vi.setSystemTime(SERVER_T0 + 4_000);
    expect(a.getState().timerRemainingMs()).toBe(full - 4_000);
    a.getState().pauseTimer();
    expect(a.getState().timer.remainingMs).toBe(full - 4_000);
  });
});
