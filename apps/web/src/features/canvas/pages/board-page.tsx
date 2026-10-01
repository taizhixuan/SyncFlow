import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { useStore } from 'zustand';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  DoorOpen,
  FileQuestion,
  Grid2x2,
  History,
  LayoutTemplate,
  Library,
  Lock,
  LogIn,
  Map as MapIcon,
  Maximize,
  MessageSquare,
  Presentation,
  Scan,
  Share2,
  SunMoon,
  Timer,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from '@/app/theme';
import { useIsPhone } from '@/hooks/use-media-query';
import { useBoard } from '@/features/boards/hooks/use-boards';
import { renameBoard } from '@/features/boards/api/boards-api';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { useBoardSync, useLaserBroadcast } from '@/features/sync/use-board-sync';
import { usePresence } from '@/features/presence/use-presence';
import { createCanvasStore, VIEWER_TOOLS } from '../engine/canvas-store';
import { CanvasStage } from '../components/canvas-stage';
import { ToolRail, TOOL_GROUPS } from '../components/tool-rail';
import { CanvasTopBar } from '../components/canvas-top-bar';
import { CanvasStatusBar } from '../components/canvas-status-bar';
import { CanvasInspector } from '../components/canvas-inspector';
import { CommandPalette, useCommandPaletteHotkey, type Command } from '../components/command-palette';
import { StyleBar } from '../components/style-bar';
import { AlignBar } from '../components/align-bar';
import { CommentsPanel } from '../components/comments-panel';
import { TemplatesDrawer } from '../components/templates-drawer';
import { ComponentLibrary } from '../components/component-library';
import { TagFilterBar } from '../components/tag-filter-bar';
import { BoardTimer } from '../components/board-timer';
import { PresentationBar } from '../components/presentation-bar';
import { Minimap } from '../components/minimap';
import { CanvasNotice, useCanvasNotice } from '../components/canvas-notice';
import { VersionHistoryPanel } from '@/features/history/components/version-history-panel';
import { LeaveBoardButton } from '@/features/boards/components/leave-board-button';
import { BoardSharingPanel } from '@/features/boards/components/board-sharing-panel';
import { useCanvasKeyboard } from '../hooks/use-canvas-keyboard';
import { screenToCanvas, zoomAtPoint } from '../engine/viewport';
import { orderFrames, viewportForFrame, viewportForBounds } from '../model/presentation';
import { boardBounds } from '../model/minimap';

type RightPanel = 'none' | 'comments' | 'history' | 'templates' | 'library' | 'sharing';

export function BoardPage(): JSX.Element {
  const { boardId } = useParams();
  const id = boardId ?? 'local';
  // Keyed on the id so switching boards tears the whole editor (store, sync,
  // panels) down rather than reusing state from the previous board.
  if (id === 'local') return <BoardEditor key={id} id={id} />;
  return <RemoteBoardGate key={id} id={id} />;
}

/**
 * Confirms the signed-in user can open this board before any store or sync
 * connection exists: a 403/404 board must not mount an editor that would then
 * fail (or, worse, look writable) on its own.
 */
function RemoteBoardGate({ id }: { id: string }): JSX.Element {
  const boardQuery = useBoard(id);
  const status = boardQuery.error instanceof ApiError ? boardQuery.error.status : undefined;
  // Access problems win even over cached data (e.g. membership revoked).
  if (boardQuery.isError && (status === 403 || status === 404)) {
    return status === 403 ? (
      <BoardMessage
        Icon={Lock}
        title="You don't have access to this board"
        body="Ask the board owner to invite you, or check that you're signed in to the right account."
      />
    ) : (
      <BoardMessage
        Icon={FileQuestion}
        title="Board not found"
        body="It may have been deleted, or the link is wrong."
      />
    );
  }
  if (boardQuery.data === undefined) {
    if (boardQuery.isError) {
      return (
        <BoardMessage
          Icon={AlertTriangle}
          title="Couldn't load this board"
          body={boardQuery.error instanceof Error ? boardQuery.error.message : 'Something went wrong.'}
          onRetry={() => void boardQuery.refetch()}
          retrying={boardQuery.isFetching}
        />
      );
    }
    return <BoardLoading />;
  }
  return <BoardEditor id={id} />;
}

function BoardLoading(): JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading board"
      className="flex h-[100dvh] flex-col overflow-hidden bg-paper"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-chrome px-3">
        <div className="h-7 w-7 animate-pulse rounded-md bg-sunken" />
        <div className="h-4 w-40 animate-pulse rounded bg-sunken" />
        <div className="mx-auto hidden h-8 w-80 animate-pulse rounded-md bg-sunken md:block" />
        <div className="ml-auto h-8 w-20 animate-pulse rounded-md bg-sunken md:ml-0" />
      </div>
      <div className="relative flex flex-1">
        <div className="hidden w-14 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-chrome py-2 md:flex">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 w-9 animate-pulse rounded-md bg-sunken" />
          ))}
        </div>
        <p className="flex flex-1 items-center justify-center bg-dot-grid bg-dots font-mono text-xs text-ink-400">
          Loading board…
        </p>
      </div>
      <div className="h-8 shrink-0 border-t border-line bg-chrome" />
    </div>
  );
}

function BoardMessage({
  Icon,
  title,
  body,
  onRetry,
  retrying = false,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  onRetry?: () => void;
  retrying?: boolean;
}): JSX.Element {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-paper px-4 dark:bg-paper-dark">
      <div className="w-full max-w-sm rounded-xl border border-line bg-raised p-6 text-center shadow-float dark:border-line-dark dark:bg-raised-dark">
        <Icon size={28} strokeWidth={1.75} className="mx-auto text-ink-400" aria-hidden="true" />
        <h1 className="mt-3 font-display text-lg font-semibold text-ink dark:text-ink-dark">{title}</h1>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-dark">{body}</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {retrying ? 'Retrying…' : 'Try again'}
            </button>
          )}
          <Link
            to="/app"
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-line-dark dark:text-ink-dark dark:hover:bg-sunken-dark"
          >
            Back to boards
          </Link>
        </div>
      </div>
    </main>
  );
}

function BoardEditor({ id }: { id: string }): JSX.Element {
  const store = useMemo(() => createCanvasStore(id), [id]);
  // The store owns a pagehide listener and a debounced snapshot timer; hand it
  // back when the board unmounts or the id changes.
  useEffect(() => () => store.getState().dispose(), [store]);
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const boardQuery = useBoard(id);
  const { refetch: refetchBoard } = boardQuery;
  const title = id === 'local' ? 'Local board' : (boardQuery.data?.title ?? 'Board');
  const { notice, showNotice, dismissNotice } = useCanvasNotice();
  // The title shown is always the server's, so a failed rename reverts on its
  // own; the notice is what stops it failing silently.
  const handleRenameTitle = useCallback(
    (next: string) => {
      renameBoard(id, next)
        .then(() => refetchBoard())
        .catch((err: unknown) => {
          console.error('[board] rename failed', err);
          const reason = err instanceof Error && err.message ? ` ${err.message}` : '';
          showNotice(`Couldn't rename the board.${reason}`);
        });
    },
    [id, refetchBoard, showNotice],
  );
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');
  const togglePanel = (panel: Exclude<RightPanel, 'none'>) =>
    setRightPanel((prev) => (prev === panel ? 'none' : panel));
  // On a phone the minimap would cover a third of the board, so it starts closed there.
  const [minimapOpen, setMinimapOpen] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 768px)').matches,
  );
  // Real boards always have an authenticated user; the local scratch board has
  // none, so fall back to a local "You" identity so comments work offline too.
  const currentUser = user ? { id: user.id, name: user.displayName } : { id: 'local-user', name: 'You' };
  const canModerateAll = boardQuery.data?.role === 'owner' || boardQuery.data?.role === 'editor';
  const isOwner = boardQuery.data?.role === 'owner';
  // Editors and viewers may leave; the owner has to transfer ownership first.
  const canLeave = id !== 'local' && boardQuery.data !== undefined && !isOwner;
  const [leaveOpen, setLeaveOpen] = useState(false);
  // The server drops every doc update from a viewer; lock the store so the UI
  // can't produce edits that would only ever exist on this screen.
  const readOnly = id !== 'local' && boardQuery.data?.role === 'viewer';
  useEffect(() => {
    store.getState().setReadOnly(readOnly);
  }, [store, readOnly]);

  // Presentation mode — local UI state (not persisted, not in Yjs doc).
  const [presenting, setPresenting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  // Follow mode — which remote presenter user id we're tracking.
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);

  // Track the access token so useBoardSync knows whether it may connect; the
  // provider itself reads the latest token on every handshake.
  const [token, setToken] = useState<string | null>(() => api.getAccessToken());
  useEffect(() => {
    // The token may have changed between the initial render and this effect.
    setToken(api.getAccessToken());
    return api.onTokenChange(setToken);
  }, []);

  const connection = useStore(store, (s) => s.connection);
  const awareness = useStore(store, (s) => s.awareness);
  const timerOpen = useStore(store, (s) => s.timerOpen);
  const view = useStore(store, (s) => s.view);
  const doc = useStore(store, (s) => s.doc);
  const { setCursor, rejection } = useBoardSync(store, id, token);
  const setLaser = useLaserBroadcast(store, id, token);

  // Remote presence for follow mode — snapshot is stable between renders when unchanged.
  const remotes = usePresence(awareness);

  // The board persists its own theme; mirror it onto the app theme.
  const storeTheme = useStore(store, (s) => s.theme);
  useEffect(() => {
    if (storeTheme !== theme) setTheme(storeTheme);
  }, [storeTheme, theme, setTheme]);

  useEffect(() => {
    // Debug/e2e hook only: production builds must not hand page scripts the store.
    if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
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

  const handleStageMount = useCallback((s: Konva.Stage | null) => {
    stageRef.current = s;
  }, []);

  // The stage's own measured size (the flex area under the top bar, not the
  // window), reported by CanvasStage's ResizeObserver. Minimap, slide
  // centring and insert origins all need the same box the canvas draws into.
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  // Keep a ref in sync for use in callbacks that need the latest value without re-subscribing.
  const stageSizeRef = useRef(stageSize);
  const handleStageSize = useCallback((next: { width: number; height: number }) => {
    stageSizeRef.current = next;
    setStageSize(next);
  }, []);
  const insertOrigin = useMemo(
    () => screenToCanvas(view, { x: stageSize.width / 2, y: stageSize.height / 2 }),
    [view, stageSize],
  );

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

  const isPhone = useIsPhone();
  const hasSelection = useStore(store, (s) => s.selected.length > 0);
  const activeTool = useStore(store, (s) => s.tool);
  // The style controls apply to the selection or to the next shape drawn; on a
  // phone they only take up room when one of those exists.
  const styleBarShown = !isPhone || hasSelection || !['select', 'pan', 'laser'].includes(activeTool);

  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteHotkey(openPalette);

  // Every action the palette can run. Rebuilt per render: it is a short list
  // and only read while the palette is open.
  const commands: Command[] = TOOL_GROUPS.flat()
    .filter((t) => !readOnly || VIEWER_TOOLS.has(t.id))
    .map((t) => ({
      id: `tool-${t.id}`,
      group: 'Tools',
      label: t.label,
      Icon: t.Icon,
      shortcut: t.shortcut,
      keywords: 'tool draw',
      run: () => store.getState().setTool(t.id),
    }));
  commands.push({ id: 'comments', group: 'Panels', label: 'Comments', Icon: MessageSquare, run: () => togglePanel('comments') });
  if (id !== 'local')
    commands.push({ id: 'history', group: 'Panels', label: 'Version history', Icon: History, keywords: 'restore versions playback', run: () => togglePanel('history') });
  if (!readOnly) {
    commands.push(
      { id: 'templates', group: 'Panels', label: 'Templates', Icon: LayoutTemplate, run: () => togglePanel('templates') },
      { id: 'library', group: 'Panels', label: 'Component library', Icon: Library, run: () => togglePanel('library') },
      { id: 'timer', group: 'Panels', label: 'Timer', Icon: Timer, run: () => store.getState().toggleTimerOpen() },
    );
  }
  if (id !== 'local' && isOwner)
    commands.push({ id: 'share', group: 'Panels', label: 'Share board', Icon: Share2, keywords: 'invite members link', run: () => togglePanel('sharing') });
  commands.push(
    { id: 'theme', group: 'View', label: 'Toggle light / dark theme', Icon: SunMoon, keywords: 'dark light mode', run: () => store.getState().toggleTheme() },
    { id: 'grid', group: 'View', label: 'Toggle grid', Icon: Grid2x2, run: () => store.getState().toggleGrid() },
    { id: 'minimap', group: 'View', label: 'Toggle minimap', Icon: MapIcon, run: () => setMinimapOpen((o) => !o) },
    {
      id: 'fit',
      group: 'View',
      label: 'Zoom to fit',
      Icon: Maximize,
      keywords: 'zoom whole board',
      run: () => {
        if (elementList.length) store.getState().setView(viewportForBounds(boardBounds(elementList), stageSizeRef.current));
      },
    },
    {
      id: 'zoom-100',
      group: 'View',
      label: 'Zoom to 100%',
      Icon: Scan,
      keywords: 'reset actual size',
      run: () => {
        const v = store.getState().view;
        const c = { x: stageSizeRef.current.width / 2, y: stageSizeRef.current.height / 2 };
        store.getState().setView(zoomAtPoint(v, c, 1 / v.scale));
      },
    },
  );
  if (!readOnly)
    commands.push({ id: 'vote', group: 'Board', label: 'Toggle voting mode', Icon: Vote, keywords: 'dot vote', run: () => store.getState().toggleVotingMode() });
  if (totalSlides > 0 && !presenting)
    commands.push({ id: 'present', group: 'Board', label: 'Start presentation', Icon: Presentation, keywords: 'slides frames', run: startPresentation });
  if (canLeave) commands.push({ id: 'leave', group: 'Board', label: 'Leave board', Icon: DoorOpen, run: () => setLeaveOpen(true) });
  commands.push({ id: 'boards', group: 'Board', label: 'Back to all boards', Icon: ArrowLeft, keywords: 'dashboard home', run: () => navigate('/app') });

  // The server refused the realtime connection and sync has stopped retrying:
  // show why instead of an editor stuck on "reconnecting…".
  if (rejection === 'forbidden') {
    return (
      <BoardMessage
        Icon={Lock}
        title="You no longer have access to this board"
        body="The owner may have removed you. Ask them to invite you again."
      />
    );
  }
  if (rejection === 'not-found') {
    return <BoardMessage Icon={FileQuestion} title="Board not found" body="It may have been deleted." />;
  }
  if (rejection === 'unauthorized') {
    return (
      <BoardMessage
        Icon={LogIn}
        title="Your session expired"
        body="Sign in again to keep working on this board."
      />
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-paper">
      <CanvasTopBar
        store={store}
        title={title}
        onRenameTitle={id === 'local' ? undefined : handleRenameTitle}
        badge={id === 'local' ? 'local' : readOnly ? 'view only' : undefined}
        connection={connection}
        awareness={awareness}
        onOpenCommands={openPalette}
        onToggleHistory={id === 'local' ? undefined : () => togglePanel('history')}
        historyOpen={rightPanel === 'history'}
        onToggleComments={() => togglePanel('comments')}
        commentsOpen={rightPanel === 'comments'}
        onToggleTimer={readOnly ? undefined : () => store.getState().toggleTimerOpen()}
        timerOpen={timerOpen}
        onToggleTemplates={readOnly ? undefined : () => togglePanel('templates')}
        templatesOpen={rightPanel === 'templates'}
        onToggleLibrary={readOnly ? undefined : () => togglePanel('library')}
        libraryOpen={rightPanel === 'library'}
        onStartPresentation={startPresentation}
        presenting={presenting}
        frameCount={frames.length}
        getStage={getStage}
        onToggleSharing={id !== 'local' && isOwner ? () => togglePanel('sharing') : undefined}
        sharingOpen={rightPanel === 'sharing'}
        onLeaveBoard={canLeave ? () => setLeaveOpen((o) => !o) : undefined}
        leaveOpen={leaveOpen}
      />
      <div className="relative flex flex-1 overflow-hidden">
        <ToolRail store={store} />
        {/* From md up the side panels dock: the canvas gives up their width
            instead of sitting underneath them. */}
        <div
          className={`relative flex-1 overflow-hidden ${
            rightPanel === 'none'
              ? presenting
                ? ''
                : 'lg:mr-[280px]'
              : rightPanel === 'sharing'
                ? 'md:mr-96'
                : 'md:mr-80'
          }`}
        >
        {leaveOpen && canLeave && (
          <div className="absolute right-3 top-3 z-30 w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-line bg-raised shadow-float">
            <LeaveBoardButton
              boardId={id}
              boardTitle={title}
              initiallyConfirming
              onCancel={() => setLeaveOpen(false)}
            />
          </div>
        )}
        {!readOnly && (
          <>
            {styleBarShown && (
              // Desktop: top-right. Phone: a strip just above the tool dock,
              // shown only while there is something to style.
              <div className="absolute inset-x-2 bottom-[4.5rem] z-10 flex justify-center md:inset-x-auto md:bottom-auto md:right-3 md:top-3 lg:hidden">
                <StyleBar store={store} userId={user?.id} />
              </div>
            )}
            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <AlignBar store={store} />
            </div>
          </>
        )}
        {!(isPhone && styleBarShown) && (
          <div className="absolute bottom-[4.5rem] left-1/2 z-10 -translate-x-1/2 md:bottom-4">
            <TagFilterBar store={store} />
          </div>
        )}
        {timerOpen && (
          <div className="absolute right-3 top-3 z-20 w-56 md:top-14">
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
                      ? 'bg-accent text-on-accent'
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
          boardId={id === 'local' ? undefined : id}
          awareness={awareness}
          onCursor={(c) => { setCursor(c); if (c) cancelFollow(); }}
          onLaser={setLaser}
          votingUserId={user?.id}
          onStageMount={handleStageMount}
          onSizeChange={handleStageSize}
          onAddComment={(elementId) => {
            if (!currentUser) return;
            const commentId = store.getState().addComment({
              elementId,
              body: '',
              author: currentUser,
            });
            if (!commentId) return;
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
          <div className="pointer-events-none absolute bottom-[4.5rem] right-2 z-10 md:bottom-3 md:right-3">
            <Minimap store={store} stageSize={stageSize} />
          </div>
        )}
        </div>
      </div>
      <CanvasStatusBar
        store={store}
        stageSize={stageSize}
        awareness={awareness}
        connection={connection}
        isLocal={id === 'local'}
        minimapOpen={minimapOpen}
        onToggleMinimap={() => setMinimapOpen((o) => !o)}
      />
      {/* From lg up the style controls live in a docked inspector; any side
          panel takes its column while open. */}
      {rightPanel === 'none' && !presenting && (
        <CanvasInspector
          store={store}
          awareness={id === 'local' ? undefined : awareness}
          onOpenComments={() => togglePanel('comments')}
          onOpenHistory={id === 'local' ? undefined : () => togglePanel('history')}
        />
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <CommentsPanel
        store={store}
        open={rightPanel === 'comments'}
        onClose={() => setRightPanel('none')}
        currentUser={currentUser}
        canModerateAll={canModerateAll}
        readOnly={readOnly}
      />
      <TemplatesDrawer
        store={store}
        open={rightPanel === 'templates'}
        onClose={() => setRightPanel('none')}
        insertOrigin={insertOrigin}
      />
      <ComponentLibrary
        store={store}
        open={rightPanel === 'library'}
        onClose={() => setRightPanel('none')}
        insertOrigin={insertOrigin}
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
      <CanvasNotice notice={notice} onDismiss={dismissNotice} />
    </div>
  );
}
