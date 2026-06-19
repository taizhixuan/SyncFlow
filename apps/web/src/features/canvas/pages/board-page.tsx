import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useParams } from 'react-router-dom';
import { useTheme } from '@/app/theme';
import { useBoard } from '@/features/boards/hooks/use-boards';
import { api } from '@/lib/api';
import { useBoardSync } from '@/features/sync/use-board-sync';
import { createCanvasStore } from '../engine/canvas-store';
import { CanvasStage } from '../components/canvas-stage';
import { ToolRail } from '../components/tool-rail';
import { CanvasTopBar } from '../components/canvas-top-bar';
import { StyleBar } from '../components/style-bar';
import { AlignBar } from '../components/align-bar';
import { useCanvasKeyboard } from '../hooks/use-canvas-keyboard';

export function BoardPage(): JSX.Element {
  const { boardId } = useParams();
  const id = boardId ?? 'local';
  const store = useMemo(() => createCanvasStore(id), [id]);
  const { theme, setTheme } = useTheme();
  const boardQuery = useBoard(id);
  const title = id === 'local' ? 'Local board' : (boardQuery.data?.title ?? 'Board');

  // Track the access token so useBoardSync can (re-)connect after a silent refresh.
  const [token, setToken] = useState<string | null>(() => api.getAccessToken());
  useEffect(() => {
    // Sync initial value (the token may have been set before this component mounted).
    setToken(api.getAccessToken());
    // Subscribe to future token changes (transparent refresh, logout).
    api.onTokenChange(setToken);
    return () => {
      // Remove the listener on unmount to avoid stale updates.
      api.onTokenChange(() => undefined);
    };
  }, []);

  const connection = useStore(store, (s) => s.connection);
  useBoardSync(store, id, token);

  // The board persists its own theme; mirror it onto the app theme.
  const storeTheme = useStore(store, (s) => s.theme);
  useEffect(() => {
    if (storeTheme !== theme) setTheme(storeTheme);
  }, [storeTheme, theme, setTheme]);

  useEffect(() => {
    (window as unknown as { __canvas?: unknown }).__canvas = store;
    return () => {
      delete (window as unknown as { __canvas?: unknown }).__canvas;
    };
  }, [store]);

  useCanvasKeyboard(store);

  return (
    <div className="flex h-screen flex-col bg-paper dark:bg-paper-dark">
      <CanvasTopBar store={store} title={title} badge={id === 'local' ? 'local' : undefined} connection={connection} />
      <div className="relative flex flex-1 overflow-hidden">
        <div className="absolute left-3 top-3 z-10">
          <ToolRail store={store} />
        </div>
        <div className="absolute right-3 top-3 z-10">
          <StyleBar store={store} />
        </div>
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <AlignBar store={store} />
        </div>
        <CanvasStage store={store} />
      </div>
    </div>
  );
}
