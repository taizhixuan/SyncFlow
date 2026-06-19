import { useState, useEffect } from 'react';
import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';

const DURATIONS_MS: { label: string; ms: number }[] = [
  { label: '1 min', ms: 60_000 },
  { label: '3 min', ms: 3 * 60_000 },
  { label: '5 min', ms: 5 * 60_000 },
  { label: '10 min', ms: 10 * 60_000 },
  { label: '15 min', ms: 15 * 60_000 },
];

function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * BoardTimer — a shared countdown timer panel backed by ydoc.getMap('meta').
 * All connected clients see the same running/paused state and countdown.
 * The display ticks locally via setInterval; the canonical state lives in Yjs.
 */
export function BoardTimer({ store }: { store: CanvasStore }): JSX.Element {
  const timer = useStore(store, (s) => s.timer);
  const s = store.getState();

  // Local tick to update the display every second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [timer.running]);

  const displayMs = timer.running && timer.endsAt != null
    ? Math.max(0, timer.endsAt - Date.now())
    : timer.remainingMs;

  const expired = displayMs <= 0 && timer.running;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-raised dark:border-line-dark dark:bg-raised-dark">
      {/* Countdown display */}
      <div
        className={`text-center font-mono text-4xl font-bold tabular-nums ${
          expired
            ? 'text-red-500 dark:text-red-400'
            : timer.running
            ? 'text-ink dark:text-ink-dark'
            : 'text-ink-400 dark:text-ink-600'
        }`}
        aria-live="polite"
        aria-label={`Timer: ${formatMs(displayMs)}`}
      >
        {formatMs(displayMs)}
      </div>

      {expired && (
        <p className="text-center text-sm font-medium text-red-500 dark:text-red-400">Time's up!</p>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-2">
        {timer.running ? (
          <button
            onClick={() => s.pauseTimer()}
            aria-label="Pause timer"
            className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
          >
            ⏸ Pause
          </button>
        ) : (
          <button
            onClick={() => s.startTimer()}
            aria-label="Start timer"
            disabled={displayMs <= 0}
            className="rounded-md bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-40 dark:bg-emerald-900/40 dark:text-emerald-300"
          >
            ▶ Start
          </button>
        )}
        <button
          onClick={() => s.resetTimer()}
          aria-label="Reset timer"
          className="rounded-md bg-sunken px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-line dark:bg-sunken-dark dark:text-ink-dark"
        >
          ↺ Reset
        </button>
      </div>

      {/* Duration presets */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {DURATIONS_MS.map(({ label, ms }) => (
          <button
            key={ms}
            onClick={() => s.setTimerDuration(ms)}
            aria-label={`Set timer to ${label}`}
            aria-pressed={timer.durationMs === ms}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              timer.durationMs === ms
                ? 'bg-brand text-white'
                : 'bg-sunken text-ink-600 hover:bg-line dark:bg-sunken-dark dark:text-ink-dark'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
