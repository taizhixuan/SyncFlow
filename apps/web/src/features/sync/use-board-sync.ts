import { useEffect, useMemo } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { BoardSyncProvider } from './socket-sync';
import { useAuth } from '@/features/auth/auth-context';
import type { CanvasStore } from '@/features/canvas/engine/canvas-store';

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? 'http://localhost:3000';
const CURSOR_THROTTLE_MS = 50;

/** A throttled setter the stage calls to publish the local cursor position. */
export type CursorSetter = (cursor: { x: number; y: number } | null) => void;

/** A throttled setter the stage calls to publish the local laser pointer position. */
export type LaserSetter = (laser: { x: number; y: number } | null) => void;

export function useBoardSync(store: CanvasStore, boardId: string, token: string | null): CursorSetter {
  const { user } = useAuth();
  const userId = user?.id;
  const userName = user?.displayName;
  const userColor = user?.color;

  useEffect(() => {
    if (boardId === 'local' || !token) return;
    const { ydoc, awareness, applyRemote, setConnection } = store.getState();

    // Persist the Yjs doc to IndexedDB so offline edits survive a page reload.
    // On reconnect the BoardSyncProvider emits clientSync with the full ydoc state,
    // which the server merges and fans out — completing offline reconciliation.
    let disposed = false;
    const idb = new IndexeddbPersistence(`syncflow-board-${boardId}`, ydoc);

    const provider = new BoardSyncProvider({
      url: SYNC_URL,
      boardId,
      token,
      ydoc,
      awareness,
      applyRemote,
      onStatus: setConnection,
    });
    // Load any persisted offline edits BEFORE connecting, so clientSync includes them.
    idb.whenSynced.then(() => {
      if (!disposed) provider.connect();
    });

    // Publish who we are once, so remote clients can render our cursor/avatar.
    if (userId && userName && userColor) {
      awareness.setLocalStateField('user', { id: userId, name: userName, color: userColor });
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
  }, [store, boardId, token, userId, userName, userColor]);

  // Stable throttled cursor publisher: emits at most once per CURSOR_THROTTLE_MS,
  // but always lets a trailing `null` (pointer leave) through immediately.
  return useMemo<CursorSetter>(() => {
    let last = 0;
    return (cursor) => {
      if (boardId === 'local' || !token) return;
      const now = Date.now();
      if (cursor !== null && now - last < CURSOR_THROTTLE_MS) return;
      last = now;
      store.getState().awareness.setLocalStateField('cursor', cursor);
    };
  }, [store, boardId, token]);
}

/**
 * Returns a throttled laser setter. Call with a canvas-coordinate point to
 * broadcast the laser position (includes a timestamp for fade-out). Call with
 * null to clear it. The local laser is always stored with the current timestamp
 * so remote clients can derive opacity from `Date.now() - laser.t`.
 */
export function useLaserBroadcast(store: CanvasStore, boardId: string, token: string | null): LaserSetter {
  return useMemo<LaserSetter>(() => {
    let last = 0;
    return (laser) => {
      if (boardId === 'local' || !token) return;
      const now = Date.now();
      if (laser !== null && now - last < CURSOR_THROTTLE_MS) return;
      last = now;
      const field = laser ? { x: laser.x, y: laser.y, t: now } : null;
      store.getState().awareness.setLocalStateField('laser', field);
    };
  }, [store, boardId, token]);
}
