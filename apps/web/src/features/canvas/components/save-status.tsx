import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { CanvasStore } from '../engine/canvas-store';

/**
 * Autosave indicator. The board autosaves continuously — local boards to this
 * browser, synced boards to the server (debounced snapshots) over the live
 * connection. This surfaces that: "Saving…" right after an edit, then "Saved".
 */
export function SaveStatus({
  store,
  connection,
  isLocal,
}: {
  store: CanvasStore;
  connection?: 'offline' | 'connecting' | 'live';
  isLocal?: boolean;
}): JSX.Element {
  const doc = useStore(store, (s) => s.doc);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(() => Date.now());
  const first = useRef(true);

  useEffect(() => {
    // Skip the initial mount; only react to actual edits.
    if (first.current) {
      first.current = false;
      return;
    }
    setSaving(true);
    const id = setTimeout(() => {
      setSaving(false);
      setSavedAt(Date.now());
    }, 700);
    return () => clearTimeout(id);
  }, [doc]);

  const time = new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let label: string;
  if (saving) label = 'Saving…';
  else if (isLocal) label = 'Saved on this device';
  else if (connection === 'offline') label = 'Offline, saved on this device';
  else label = `Saved ${time}`;

  return (
    <span
      role="status"
      title={isLocal ? 'Autosaved to this browser' : 'Autosaved to the server'}
      className="flex items-center gap-1 font-mono text-[11px] text-ink-400 dark:text-ink-dark"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${saving ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`}
      />
      {label}
    </span>
  );
}
