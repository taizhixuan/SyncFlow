import { useEffect, useMemo, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { BoardSyncProvider, type SyncRejection } from './socket-sync';
import type { CanvasStore } from '@/features/canvas/engine/canvas-store';

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? 'http://localhost:3000';
const CURSOR_THROTTLE_MS = 50;
/** Fallback presence color so a user missing one is still visible (not filtered out). */
const FALLBACK_COLOR = PRESENCE_PALETTE[0];

/** A throttled setter the stage calls to publish the local cursor position. */
export type CursorSetter = (cursor: { x: number; y: number } | null) => void;

/** A throttled setter the stage calls to publish the local laser pointer position. */
export type LaserSetter = (laser: { x: number; y: number } | null) => void;

export type { SyncRejection };

export interface BoardSyncHandle {
  /** Throttled publisher for the local cursor position. */
  setCursor: CursorSetter;
  /**
   * Set when the server refused this board for good — `forbidden` (not a
   * member / access revoked), `not-found`, or `unauthorized` (the session could
   * not be refreshed). The provider has stopped reconnecting; show a terminal
   * state instead of "reconnecting…". Null while fine.
   */
  rejection: SyncRejection | null;
}

/** Fresh access token for the sync handshake, or null when the session is gone. */
async function refreshAccessToken(): Promise<string | null> {
  const session = await api.refreshSession();
  return session?.accessToken ?? null;
}

/**
 * Connects the board's Yjs doc + Awareness to the sync server.
 *
 * `token` only gates whether we connect at all: the provider reads the latest
 * token from the api client on every handshake, so a silent refresh (a new
 * token string) no longer tears down the provider, IndexedDB and Awareness —
 * which made peers see us leave and rejoin.
 */
export function useBoardSync(store: CanvasStore, boardId: string, token: string | null): BoardSyncHandle {
  const { user } = useAuth();
  const hasToken = token !== null;
  const [rejection, setRejection] = useState<{ boardId: string; reason: SyncRejection } | null>(null);
  const userId = user?.id;
  const userName = user?.displayName;
  const userColor = user?.color;

  // The presence identity peers render us by. Built here (with a color fallback)
  // and handed to the provider, which re-stamps it onto Awareness on every
  // connect — so identity survives auth/token churn and reconnects.
  const presenceUser = useMemo(
    () => (userId && userName ? { id: userId, name: userName, color: userColor ?? FALLBACK_COLOR } : undefined),
    [userId, userName, userColor],
  );

  useEffect(() => {
    if (boardId === 'local') return;
    if (!hasToken) {
      // A real board but no access token (e.g. the session/refresh token expired,
      // or the backend was restarted) — we are NOT connected. Reflect that honestly
      // instead of leaving a stale "live" badge while presence silently fails.
      store.getState().setConnection('offline');
      return;
    }
    const { ydoc, awareness, applyRemote, setConnection, setClockOffset } = store.getState();

    // Re-arm local Awareness. A previous provider teardown calls
    // removeAwarenessStates(self), which sets our local state to `null` — and
    // y-protocols' setLocalStateField is a SILENT NO-OP while local state is
    // null. Under React StrictMode (mount → unmount → mount) that teardown runs
    // between mounts, so without this the second mount's user/selection/cursor
    // sets do nothing and we publish no presence at all (peers see no cursor).
    if (awareness.getLocalState() === null) awareness.setLocalState({});

    // Persist the Yjs doc to IndexedDB so offline edits survive a page reload.
    // On reconnect the BoardSyncProvider emits clientSync with the full ydoc state,
    // which the server merges and fans out — completing offline reconciliation.
    let disposed = false;
    const idb = new IndexeddbPersistence(`syncflow-board-${boardId}`, ydoc);

    const provider = new BoardSyncProvider({
      url: SYNC_URL,
      boardId,
      getToken: () => api.getAccessToken(),
      refreshToken: refreshAccessToken,
      onRejected: (reason) => setRejection({ boardId, reason }),
      ydoc,
      awareness,
      user: presenceUser,
      applyRemote,
      onStatus: setConnection,
      onClockOffset: setClockOffset,
    });
    // Load any persisted offline edits BEFORE connecting, so clientSync includes them.
    idb.whenSynced.then(() => {
      if (!disposed) provider.connect();
    });

    // Publish who we are immediately (the provider also re-stamps this on connect).
    if (presenceUser) {
      awareness.setLocalStateField('user', presenceUser);
    }

    // Mirror the local selection into awareness so collaborators see our highlights.
    awareness.setLocalStateField('selection', store.getState().selected);
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.selected !== prev.selected) {
        awareness.setLocalStateField('selection', state.selected);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
      provider.destroy();
      void idb.destroy();
    };
  }, [store, boardId, hasToken, presenceUser]);

  // Stable throttled cursor publisher: emits at most once per CURSOR_THROTTLE_MS,
  // but always lets a trailing `null` (pointer leave) through immediately.
  const setCursor = useMemo<CursorSetter>(() => {
    let last = 0;
    return (cursor) => {
      if (boardId === 'local' || !hasToken) return;
      const now = Date.now();
      if (cursor !== null && now - last < CURSOR_THROTTLE_MS) return;
      last = now;
      store.getState().awareness.setLocalStateField('cursor', cursor);
    };
  }, [store, boardId, hasToken]);

  // A rejection belongs to the board it happened on; switching boards clears it.
  const currentRejection = rejection?.boardId === boardId ? rejection.reason : null;
  return useMemo(() => ({ setCursor, rejection: currentRejection }), [setCursor, currentRejection]);
}

/**
 * Returns a throttled laser setter. Call with a canvas-coordinate point to
 * broadcast the laser position (includes a timestamp for fade-out). Call with
 * null to clear it. The local laser is always stored with the current timestamp
 * so remote clients can derive opacity from `Date.now() - laser.t`.
 */
export function useLaserBroadcast(store: CanvasStore, boardId: string, token: string | null): LaserSetter {
  const hasToken = token !== null;
  return useMemo<LaserSetter>(() => {
    let last = 0;
    return (laser) => {
      if (boardId === 'local' || !hasToken) return;
      const awareness = store.getState().awareness;
      if (laser === null) {
        // Pointer-up/leave fire repeatedly; clearing an already-clear laser
        // would still broadcast an awareness update to every peer each time.
        if (awareness.getLocalState()?.laser == null) return;
        awareness.setLocalStateField('laser', null);
        return;
      }
      const now = Date.now();
      if (now - last < CURSOR_THROTTLE_MS) return;
      last = now;
      awareness.setLocalStateField('laser', { x: laser.x, y: laser.y, t: now });
    };
  }, [store, boardId, hasToken]);
}
