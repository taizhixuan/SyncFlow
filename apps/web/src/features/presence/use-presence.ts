import { useRef } from 'react';
import { useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type { PresenceState } from '@syncflow/shared';

/**
 * A remote peer's presence plus its Awareness clientId. The same user open in
 * two tabs is two peers (two cursors), so render keys must use `clientId`,
 * never `user.id`.
 */
export interface RemotePresence extends PresenceState {
  clientId: number;
}

/** Pure: current remote presence states (excludes local client). */
export function snapshot(awareness: Awareness): RemotePresence[] {
  const out: RemotePresence[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const s = state as Partial<PresenceState>;
    if (s.user) {
      out.push({
        clientId,
        user: s.user,
        cursor: s.cursor ?? null,
        selection: s.selection ?? [],
        laser: s.laser ?? null,
        presenting: s.presenting ?? null,
      });
    }
  });
  return out;
}

export function usePresence(awareness: Awareness): RemotePresence[] {
  const cacheRef = useRef<{ key: string; val: RemotePresence[] }>({ key: '', val: [] });
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
