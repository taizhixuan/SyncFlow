import { useState, useEffect } from 'react';
import { useStore } from 'zustand';
import { Pause, Play, RotateCcw } from 'lucide-react';
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
 * The display ticks locally via setInterval; the canonical state lives in Yjs
 * and its instants are on the server clock.
 */
export function BoardTimer({ store }: { store: CanvasStore }): JSX.Element {
  const timer = useStore(store, (s) => s.timer);
  // Subscribed only so a fresh clock measurement re-renders the countdown at once.
  useStore(store, (s) => s.clockOffsetMs);
  const s = store.getState();

  // Local tick to refresh the display. The countdown itself comes from the
  // store, which measures it on the server clock so every client agrees.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [timer.running]);

  const displayMs = s.timerRemainingMs();

  const expired = displayMs <= 0 && timer.running;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-raised dark:border-line-dark dark:bg-raised-dark">
      {/* Countdown display */}
      <div
        className={`text-center font-mono text-4xl font-bold tabular-nums ${
          expired
            ? 'text-danger'
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
        <p className="text-center text-sm font-medium text-danger">Time's up!</p>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-2">
        {timer.running ? (
          <button
            onClick={() => s.pauseTimer()}
            aria-label="Pause timer"
            className="inline-flex items-center gap-1.5 rounded-md bg-warn/15 px-3 py-1.5 text-sm font-medium text-ink hover:bg-warn/25"
          >
            <Pause size={14} strokeWidth={2} aria-hidden="true" />
            Pause
          </button>
        ) : (
          <button
            onClick={() => s.startTimer()}
            aria-label="Start timer"
            disabled={displayMs <= 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-3 py-1.5 text-sm font-medium text-success hover:bg-success/25 disabled:opacity-40"
          >
            <Play size={14} strokeWidth={2} aria-hidden="true" />
            Start
          </button>
        )}
        <button
          onClick={() => s.resetTimer()}
          aria-label="Reset timer"
          className="inline-flex items-center gap-1.5 rounded-md bg-sunken px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-line dark:bg-sunken-dark dark:text-ink-dark"
        >
          <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
          Reset
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
                ? 'bg-accent text-on-accent'
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
