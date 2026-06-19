import { useEffect } from 'react';
import { BoardSyncProvider } from './socket-sync';
import type { CanvasStore } from '@/features/canvas/engine/canvas-store';

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? 'http://localhost:3000';

export function useBoardSync(store: CanvasStore, boardId: string, token: string | null): void {
  useEffect(() => {
    if (boardId === 'local' || !token) return;
    const { ydoc, applyRemote, setConnection } = store.getState();
    const provider = new BoardSyncProvider({
      url: SYNC_URL,
      boardId,
      token,
      ydoc,
      applyRemote,
      onStatus: setConnection,
    });
    provider.connect();
    return () => provider.destroy();
  }, [store, boardId, token]);
}
