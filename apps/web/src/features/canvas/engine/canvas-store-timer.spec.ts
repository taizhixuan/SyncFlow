import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createCanvasStore } from './canvas-store';

describe('canvas store — timer across clocks', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('a peer with a fast clock counts down the full remaining time', () => {
    vi.useFakeTimers();
    const a = createCanvasStore('board-a');
    const b = createCanvasStore('board-b');
    vi.setSystemTime(1_000_000);
    a.getState().startTimer();
    const remaining = a.getState().timer.remainingMs;
    expect(a.getState().timer.endsAt! - Date.now()).toBe(remaining);

    vi.setSystemTime(1_000_000 + 60_000); // b's clock is a minute ahead
    b.getState().applyRemote(Y.encodeStateAsUpdate(a.getState().ydoc));
    expect(b.getState().timer.running).toBe(true);
    expect(b.getState().timer.endsAt! - Date.now()).toBe(remaining);

    // Pausing on b freezes what b actually displayed, not the skewed value.
    vi.setSystemTime(1_000_000 + 60_000 + 10_000);
    b.getState().pauseTimer();
    expect(b.getState().timer.remainingMs).toBe(remaining - 10_000);
  });
});
