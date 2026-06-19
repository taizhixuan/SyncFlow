import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useParams } from 'react-router-dom';
import { useTheme } from '@/app/theme';
import { useBoard } from '@/features/boards/hooks/use-boards';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { useBoardSync, useLaserBroadcast } from '@/features/sync/use-board-sync';
import { createCanvasStore } from '../engine/canvas-store';
import { CanvasStage } from '../components/canvas-stage';
import { ToolRail } from '../components/tool-rail';
import { CanvasTopBar } from '../components/canvas-top-bar';
import { StyleBar } from '../components/style-bar';
import { AlignBar } from '../components/align-bar';
import { CommentsPanel } from '../components/comments-panel';
import { TemplatesDrawer } from '../components/templates-drawer';
import { ComponentLibrary } from '../components/component-library';
import { TagFilterBar } from '../components/tag-filter-bar';
import { BoardTimer } from '../components/board-timer';
import { VersionHistoryPanel } from '@/features/history/components/version-history-panel';
import { useCanvasKeyboard } from '../hooks/use-canvas-keyboard';
import { screenToCanvas } from '../engine/viewport';

export function BoardPage(): JSX.Element {
  const { boardId } = useParams();
  const id = boardId ?? 'local';
  const store = useMemo(() => createCanvasStore(id), [id]);
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const boardQuery = useBoard(id);
  const title = id === 'local' ? 'Local board' : (boardQuery.data?.title ?? 'Board');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const currentUser = user ? { id: user.id, name: user.displayName } : undefined;
  const canModerateAll = boardQuery.data?.role === 'owner' || boardQuery.data?.role === 'editor';

  // Track the access token so useBoardSync can (re-)connect after a silent refresh.
  const [token, setToken] = useState<string | null>(() => api.getAccessToken());
  useEffect(() => {
    // Sync initial value (the token may have been set before this component mounted).
    setToken(api.getAccessToken());
    // Subscribe to future token changes (transparent refresh, logout).
    api.onTokenChange(setToken);
    return () => {
      // Remove the listener on unmount to avoid stale updates.
      api.removeTokenChangeListener();
    };
  }, []);

  const connection = useStore(store, (s) => s.connection);
  const awareness = useStore(store, (s) => s.awareness);
  const timerOpen = useStore(store, (s) => s.timerOpen);
  const view = useStore(store, (s) => s.view);
  const setCursor = useBoardSync(store, id, token);
  const setLaser = useLaserBroadcast(store, id, token);

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
      <CanvasTopBar
        store={store}
        title={title}
        badge={id === 'local' ? 'local' : undefined}
        connection={connection}
        awareness={awareness}
        onToggleHistory={id === 'local' ? undefined : () => setHistoryOpen((o) => !o)}
        historyOpen={historyOpen}
        onToggleComments={() => setCommentsOpen((o) => !o)}
        commentsOpen={commentsOpen}
        onToggleTimer={() => store.getState().toggleTimerOpen()}
        timerOpen={timerOpen}
        onToggleTemplates={() => setTemplatesOpen((o) => !o)}
        templatesOpen={templatesOpen}
        onToggleLibrary={() => setLibraryOpen((o) => !o)}
        libraryOpen={libraryOpen}
      />
      <div className="relative flex flex-1 overflow-hidden">
        <div className="absolute left-3 top-3 z-10">
          <ToolRail store={store} />
        </div>
        <div className="absolute right-3 top-3 z-10">
          <StyleBar store={store} userId={user?.id} />
        </div>
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <AlignBar store={store} />
        </div>
        <div className="absolute bottom-12 left-1/2 z-10 -translate-x-1/2">
          <TagFilterBar store={store} />
        </div>
        {timerOpen && (
          <div className="absolute right-3 top-14 z-20 w-56">
            <BoardTimer store={store} />
          </div>
        )}
        <CanvasStage
          store={store}
          awareness={awareness}
          onCursor={setCursor}
          onLaser={setLaser}
          votingUserId={user?.id}
          onAddComment={(elementId) => {
            if (!currentUser) return;
            const commentId = store.getState().addComment({
              elementId,
              body: '',
              author: currentUser,
            });
            store.getState().setOpenCommentId(commentId);
            setCommentsOpen(true);
          }}
        />
      </div>
      <CommentsPanel
        store={store}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        currentUser={currentUser}
        canModerateAll={canModerateAll}
      />
      <TemplatesDrawer
        store={store}
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        insertOrigin={screenToCanvas(view, {
          x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
          y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
        })}
      />
      <ComponentLibrary
        store={store}
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        insertOrigin={screenToCanvas(view, {
          x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
          y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
        })}
      />
      {id !== 'local' && (
        <VersionHistoryPanel
          boardId={id}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
