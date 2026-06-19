import { useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type { PresenceState } from '@syncflow/shared';

/**
 * Reactive snapshot of remote collaborators' awareness state.
 * Subscribes to awareness `change` and returns every remote client (excluding
 * the local one) that has published a `user`. The snapshot is memoized by a
 * JSON key so React only re-renders when the visible presence actually changes.
 */
export function usePresence(awareness: Awareness): PresenceState[] {
  return useSyncExternalStore(
    (cb) => {
      awareness.on('change', cb);
      return () => awareness.off('change', cb);
    },
    () => snapshot(awareness),
  );
}

let cache: PresenceState[] = [];
let cacheKey = '';

export function snapshot(awareness: Awareness): PresenceState[] {
  const out: PresenceState[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const s = state as Partial<PresenceState>;
    if (s.user) out.push({ user: s.user, cursor: s.cursor ?? null, selection: s.selection ?? [] });
  });
  // Stabilize identity for React: only swap the cached array when content changes,
  // so unchanged presence does not churn dependent renders.
  const key = JSON.stringify(out);
  if (key !== cacheKey) {
    cacheKey = key;
    cache = out;
  }
  return cache;
}
