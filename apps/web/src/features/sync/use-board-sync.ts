import { useEffect, useMemo } from 'react';
import { BoardSyncProvider } from './socket-sync';
import { useAuth } from '@/features/auth/auth-context';
import type { CanvasStore } from '@/features/canvas/engine/canvas-store';

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? 'http://localhost:3000';
const CURSOR_THROTTLE_MS = 50;

/** A throttled setter the stage calls to publish the local cursor position. */
export type CursorSetter = (cursor: { x: number; y: number } | null) => void;

export function useBoardSync(store: CanvasStore, boardId: string, token: string | null): CursorSetter {
  const { user } = useAuth();
  const userId = user?.id;
  const userName = user?.displayName;
  const userColor = user?.color;

  useEffect(() => {
    if (boardId === 'local' || !token) return;
    const { ydoc, awareness, applyRemote, setConnection } = store.getState();
    const provider = new BoardSyncProvider({
      url: SYNC_URL,
      boardId,
      token,
      ydoc,
      awareness,
      applyRemote,
      onStatus: setConnection,
    });
    provider.connect();

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
      unsubscribe();
      provider.destroy();
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
