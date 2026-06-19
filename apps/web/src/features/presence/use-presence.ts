import { useRef } from 'react';
import { useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type { PresenceState } from '@syncflow/shared';

/** Pure: current remote presence states (excludes local client). */
export function snapshot(awareness: Awareness): PresenceState[] {
  const out: PresenceState[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const s = state as Partial<PresenceState>;
    if (s.user) out.push({ user: s.user, cursor: s.cursor ?? null, selection: s.selection ?? [], laser: s.laser ?? null });
  });
  return out;
}

export function usePresence(awareness: Awareness): PresenceState[] {
  const cacheRef = useRef<{ key: string; val: PresenceState[] }>({ key: '', val: [] });
  return useSyncExternalStore(
    (cb) => { awareness.on('change', cb); return () => awareness.off('change', cb); },
    () => {
      const out = snapshot(awareness);
      const key = JSON.stringify(out);
      if (key !== cacheRef.current.key) cacheRef.current = { key, val: out };
      return cacheRef.current.val;
    },
  );
}
