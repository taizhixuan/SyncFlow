import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { useStore } from 'zustand';
import { useParams } from 'react-router-dom';
import { useTheme } from '@/app/theme';
import { useBoard } from '@/features/boards/hooks/use-boards';
import { renameBoard } from '@/features/boards/api/boards-api';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { useBoardSync, useLaserBroadcast } from '@/features/sync/use-board-sync';
import { usePresence } from '@/features/presence/use-presence';
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
import { PresentationBar } from '../components/presentation-bar';
import { Minimap } from '../components/minimap';
import { VersionHistoryPanel } from '@/features/history/components/version-history-panel';
import { BoardSharingPanel } from '@/features/boards/components/board-sharing-panel';
import { useCanvasKeyboard } from '../hooks/use-canvas-keyboard';
import { screenToCanvas } from '../engine/viewport';
import { orderFrames, viewportForFrame, viewportForBounds } from '../model/presentation';
import { boardBounds } from '../model/minimap';

type RightPanel = 'none' | 'comments' | 'history' | 'templates' | 'library' | 'sharing';

export function BoardPage(): JSX.Element {
  const { boardId } = useParams();
  const id = boardId ?? 'local';
  const store = useMemo(() => createCanvasStore(id), [id]);
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const boardQuery = useBoard(id);
  const title = id === 'local' ? 'Local board' : (boardQuery.data?.title ?? 'Board');
  const handleRenameTitle = useCallback(
    (next: string) => {
      void renameBoard(id, next).then(() => boardQuery.refetch());
    },
    [id, boardQuery],
  );
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');
  const togglePanel = (panel: Exclude<RightPanel, 'none'>) =>
    setRightPanel((prev) => (prev === panel ? 'none' : panel));
  const [minimapOpen, setMinimapOpen] = useState(true);
  // Real boards always have an authenticated user; the local scratch board has
  // none, so fall back to a local "You" identity so comments work offline too.
  const currentUser = user ? { id: user.id, name: user.displayName } : { id: 'local-user', name: 'You' };
  const canModerateAll = boardQuery.data?.role === 'owner' || boardQuery.data?.role === 'editor';
  const isOwner = boardQuery.data?.role === 'owner';

  // Presentation mode — local UI state (not persisted, not in Yjs doc).
  const [presenting, setPresenting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  // Follow mode — which remote presenter user id we're tracking.
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);

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
  const doc = useStore(store, (s) => s.doc);
  const setCursor = useBoardSync(store, id, token);
  const setLaser = useLaserBroadcast(store, id, token);

  // Remote presence for follow mode — snapshot is stable between renders when unchanged.
  const remotes = usePresence(awareness);

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

  // Derive the ordered frame list from the current doc.
  const frames = useMemo(
    () => orderFrames(Object.values(doc.elements)),
    [doc.elements],
  );

  // Ref to the Konva Stage — populated via CanvasStage's onStageMount callback.
  const stageRef = useRef<Konva.Stage | null>(null);
  const getStage = useCallback(() => stageRef.current, []);

  // Stage size as state so resize triggers re-renders (e.g. Minimap viewport math).
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  // Keep a ref in sync for use in callbacks that need the latest value without re-subscribing.
  const stageSizeRef = useRef(stageSize);
  useEffect(() => {
    function onResize() {
      const next = { width: window.innerWidth, height: window.innerHeight };
      stageSizeRef.current = next;
      setStageSize(next);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Navigate to a specific slide index, clamped to [0, frames.length-1].
  // Present frames as slides; with no frames, present the whole board as a single
  // fit-all slide so "Present" works on any non-empty board.
  const elementList = useMemo(() => Object.values(doc.elements), [doc.elements]);
  const totalSlides = frames.length > 0 ? frames.length : elementList.length > 0 ? 1 : 0;

  const goToSlide = useCallback(
    (index: number) => {
      if (totalSlides === 0) return;
      const clamped = Math.max(0, Math.min(totalSlides - 1, index));
      setSlideIndex(clamped);
      if (frames.length > 0) {
        const frame = frames[clamped];
        if (!frame) return;
        store.getState().setView(viewportForFrame(frame, stageSizeRef.current));
        // Broadcast the presenting state via awareness (ephemeral, never in doc).
        awareness.setLocalStateField('presenting', { slideIndex: clamped, frameId: frame.id });
      } else {
        store.getState().setView(viewportForBounds(boardBounds(elementList), stageSizeRef.current));
        awareness.setLocalStateField('presenting', { slideIndex: clamped, frameId: '__board__' });
      }
    },
    [totalSlides, frames, elementList, store, awareness],
  );

  const startPresentation = useCallback(() => {
    if (totalSlides === 0) return; // truly empty board — nothing to present
    setPresenting(true);
    goToSlide(0);
  }, [totalSlides, goToSlide]);

  const exitPresentation = useCallback(() => {
    setPresenting(false);
    setSlideIndex(0);
    // Clear the presenting awareness field on exit.
    awareness.setLocalStateField('presenting', null);
    // Also stop following anyone.
    setFollowingUserId(null);
  }, [awareness]);

  const nextSlide = useCallback(() => goToSlide(slideIndex + 1), [goToSlide, slideIndex]);
  const prevSlide = useCallback(() => goToSlide(slideIndex - 1), [goToSlide, slideIndex]);

  // Follow mode: when a remote user is presenting and we're following them,
  // animate our viewport to match their current slide whenever it changes.
  const prevFollowSlideRef = useRef<number | null>(null);
  useEffect(() => {
    if (!followingUserId) return;
    const presenter = remotes.find((r) => r.user.id === followingUserId);
    if (!presenter?.presenting) return;
    const { slideIndex: remoteSlide, frameId } = presenter.presenting;
    if (remoteSlide === prevFollowSlideRef.current) return;
    prevFollowSlideRef.current = remoteSlide;
    // Find the frame by id in our local doc.
    const frame = doc.elements[frameId];
    if (!frame) return;
    store.getState().setView(viewportForFrame(frame, stageSizeRef.current));
  }, [remotes, followingUserId, doc.elements, store]);

  // Cancel follow mode on any direct user interaction that changes the view.
  // We detect this by watching if the user presses a key or drags the canvas
  // while following — simpler: cancel follow if our view changed and we're not
  // the one driving it. For simplicity, any local canvas interaction clears follow.
  // (The CanvasStage calls onCursor on pointer move — we piggyback a cancel there.)
  const cancelFollow = useCallback(() => {
    if (followingUserId) setFollowingUserId(null);
  }, [followingUserId]);

  useCanvasKeyboard(store, presenting ? { presenting, onNext: nextSlide, onPrev: prevSlide, onExit: exitPresentation } : undefined);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-paper dark:bg-paper-dark">
      <CanvasTopBar
        store={store}
        title={title}
        onRenameTitle={id === 'local' ? undefined : handleRenameTitle}
        badge={id === 'local' ? 'local' : undefined}
        connection={connection}
        awareness={awareness}
        onToggleHistory={id === 'local' ? undefined : () => togglePanel('history')}
        historyOpen={rightPanel === 'history'}
        onToggleComments={() => togglePanel('comments')}
        commentsOpen={rightPanel === 'comments'}
        onToggleTimer={() => store.getState().toggleTimerOpen()}
        timerOpen={timerOpen}
        onToggleTemplates={() => togglePanel('templates')}
        templatesOpen={rightPanel === 'templates'}
        onToggleLibrary={() => togglePanel('library')}
        libraryOpen={rightPanel === 'library'}
        onStartPresentation={startPresentation}
        presenting={presenting}
        frameCount={frames.length}
        getStage={getStage}
        onToggleMinimap={() => setMinimapOpen((o) => !o)}
        minimapOpen={minimapOpen}
        onToggleSharing={id !== 'local' && isOwner ? () => togglePanel('sharing') : undefined}
        sharingOpen={rightPanel === 'sharing'}
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
        {/* Follow affordance: show when any remote user is presenting and we're not. */}
        {!presenting && remotes.some((r) => r.presenting != null) && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 mt-10">
            {remotes
              .filter((r) => r.presenting != null)
              .map((r) => (
                <button
                  key={r.user.id}
                  onClick={() => {
                    if (followingUserId === r.user.id) {
                      setFollowingUserId(null);
                    } else {
                      setFollowingUserId(r.user.id);
                      prevFollowSlideRef.current = null;
                    }
                  }}
                  className={`mx-1 rounded-full px-3 py-1 text-xs font-medium shadow ${
                    followingUserId === r.user.id
                      ? 'bg-brand text-white'
                      : 'bg-paper text-ink-600 ring-1 ring-line hover:bg-sunken dark:bg-paper-dark dark:text-ink-dark dark:ring-line-dark'
                  }`}
                >
                  {followingUserId === r.user.id ? `Following ${r.user.name}` : `Follow ${r.user.name}`}
                </button>
              ))}
          </div>
        )}
        <CanvasStage
          store={store}
          awareness={awareness}
          onCursor={(c) => { setCursor(c); if (c) cancelFollow(); }}
          onLaser={setLaser}
          votingUserId={user?.id}
          onStageMount={(s) => { stageRef.current = s; }}
          onAddComment={(elementId) => {
            if (!currentUser) return;
            const commentId = store.getState().addComment({
              elementId,
              body: '',
              author: currentUser,
            });
            store.getState().setOpenCommentId(commentId);
            setRightPanel('comments');
          }}
        />
        {presenting && (
          <PresentationBar
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            onPrev={prevSlide}
            onNext={nextSlide}
            onExit={exitPresentation}
          />
        )}
        {minimapOpen && (
          <div className="pointer-events-none absolute bottom-4 right-4 z-10">
            <Minimap store={store} stageSize={stageSize} />
          </div>
        )}
      </div>
      <CommentsPanel
        store={store}
        open={rightPanel === 'comments'}
        onClose={() => setRightPanel('none')}
        currentUser={currentUser}
        canModerateAll={canModerateAll}
      />
      <TemplatesDrawer
        store={store}
        open={rightPanel === 'templates'}
        onClose={() => setRightPanel('none')}
        insertOrigin={screenToCanvas(view, {
          x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
          y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
        })}
      />
      <ComponentLibrary
        store={store}
        open={rightPanel === 'library'}
        onClose={() => setRightPanel('none')}
        insertOrigin={screenToCanvas(view, {
          x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
          y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
        })}
      />
      {id !== 'local' && (
        <VersionHistoryPanel
          boardId={id}
          open={rightPanel === 'history'}
          onClose={() => setRightPanel('none')}
        />
      )}
      {id !== 'local' && (
        <BoardSharingPanel
          boardId={id}
          open={rightPanel === 'sharing'}
          onClose={() => setRightPanel('none')}
        />
      )}
    </div>
  );
}
