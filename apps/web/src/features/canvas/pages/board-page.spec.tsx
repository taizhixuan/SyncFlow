import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CanvasElement } from '@syncflow/shared';
import { ROUTER_FUTURE } from '@/app/router-future';
import { ThemeProvider } from '@/app/theme';
import { ApiError } from '@/lib/api-client';
import * as boardsHooks from '@/features/boards/hooks/use-boards';
import * as boardsApi from '@/features/boards/api/boards-api';
import type { RemotePresence } from '@/features/presence/use-presence';
import type { CursorSetter } from '@/features/sync/use-board-sync';
import type { CanvasStore } from '../engine/canvas-store';
import { addElements } from '../model/commands';
import { viewportForBounds, viewportForFrame } from '../model/presentation';
import { boardBounds } from '../model/minimap';
import { BoardPage } from './board-page';

vi.mock('@/features/boards/hooks/use-boards', async (importOriginal) => ({
  ...(await importOriginal<typeof boardsHooks>()),
  useBoard: vi.fn(),
}));
vi.mock('@/features/boards/api/boards-api', () => ({ renameBoard: vi.fn() }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/features/sync/use-board-sync', () => ({
  useBoardSync: () => ({ setCursor: () => {}, rejection: null }),
  useLaserBroadcast: () => () => {},
}));
// Who is presenting is the test's to decide, not a live awareness channel's.
const presence = vi.hoisted(() => ({ remotes: [] as RemotePresence[] }));
vi.mock('@/features/presence/use-presence', () => ({ usePresence: () => presence.remotes }));
// The real stage needs a canvas; the page only needs what it reports back.
const stageProps = vi.hoisted(() => ({ onCursor: null as CursorSetter | null }));
vi.mock('../components/canvas-stage', () => ({
  CanvasStage: (props: { onCursor?: CursorSetter }) => {
    stageProps.onCursor = props.onCursor ?? null;
    return <div data-testid="stage" />;
  },
}));

type BoardQuery = ReturnType<typeof boardsHooks.useBoard>;

function mockQuery(partial: Partial<BoardQuery>): { refetch: ReturnType<typeof vi.fn> } {
  const refetch = vi.fn();
  vi.mocked(boardsHooks.useBoard).mockReturnValue({
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch,
    ...partial,
  } as unknown as BoardQuery);
  return { refetch };
}

function renderPage(boardId = 'b1', client = new QueryClient()): void {
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/app/board/${boardId}`]} future={ROUTER_FUTURE}>
          <Routes>
            <Route path="/app/board/:boardId" element={<BoardPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('BoardPage access gate', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a loading skeleton, not the editor, while the board loads', () => {
    mockQuery({ isPending: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading board/i })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('shows a forbidden screen with a way back for a 403', () => {
    mockQuery({ isError: true, error: new ApiError(403, 'Forbidden') });
    renderPage();
    expect(screen.getByRole('heading', { name: /don.t have access/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to boards/i })).toHaveAttribute('href', '/app');
  });

  it('shows a not-found screen for a 404', () => {
    mockQuery({ isError: true, error: new ApiError(404, 'Not found') });
    renderPage();
    expect(screen.getByRole('heading', { name: /board not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to boards/i })).toHaveAttribute('href', '/app');
  });

  it('treats a malformed board id (400) as not found, not as retryable', () => {
    mockQuery({ isError: true, error: new ApiError(400, 'Malformed identifier') });
    renderPage();
    expect(screen.getByRole('heading', { name: /board not found/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('offers a retry for any other failure', () => {
    const { refetch } = mockQuery({ isError: true, error: new ApiError(500, 'Boom') });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});

function canvasStore(): CanvasStore {
  return (window as unknown as { __canvas: CanvasStore }).__canvas;
}

function el(id: string, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: 'rect',
    x: 100,
    y: 100,
    width: 200,
    height: 120,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 1,
    strokeStyle: 'solid',
    ...extra,
  } as CanvasElement;
}

function presenter(frameId: string): RemotePresence {
  return {
    clientId: 2,
    user: { id: 'u2', name: 'Pat', color: '#6366F1' },
    cursor: null,
    selection: [],
    laser: null,
    presenting: { slideIndex: 0, frameId },
  } as RemotePresence;
}

// jsdom has no layout, so the page's stage box stays at its 800x600 default.
const STAGE = { width: 800, height: 600 };

describe('BoardPage presentation and follow mode', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    presence.remotes = [];
    localStorage.clear();
  });

  it('keeps following a presenter while the mouse merely moves over the board', () => {
    const frame = el('f1', { type: 'frame', x: 1000, y: 1000 } as Partial<CanvasElement>);
    presence.remotes = [presenter('f1')];
    renderPage('local');
    act(() => canvasStore().getState().dispatch(addElements([frame])));
    fireEvent.click(screen.getByRole('button', { name: 'Follow Pat' }));
    expect(canvasStore().getState().view).toEqual(viewportForFrame(frame, STAGE));

    act(() => stageProps.onCursor?.({ x: 10, y: 10 }));
    expect(screen.getByRole('button', { name: 'Following Pat' })).toBeInTheDocument();

    // A real view change (wheel, pan, zoom buttons) is what ends it.
    act(() => canvasStore().getState().setView({ x: 0, y: 0, scale: 2 }));
    expect(screen.getByRole('button', { name: 'Follow Pat' })).toBeInTheDocument();
  });

  it('follows a presenter showing the whole board (no frames)', () => {
    const els = [el('a'), el('b', { x: 900, y: 700 })];
    presence.remotes = [presenter('__board__')];
    renderPage('local');
    act(() => canvasStore().getState().dispatch(addElements(els)));
    fireEvent.click(screen.getByRole('button', { name: 'Follow Pat' }));
    expect(canvasStore().getState().view).toEqual(viewportForBounds(boardBounds(els), STAGE));
  });

  it('puts the view back where it was when the presentation ends', () => {
    renderPage('local');
    act(() => {
      canvasStore().getState().dispatch(addElements([el('a')]));
      canvasStore().getState().setView({ x: 5, y: 7, scale: 1.5 });
    });
    fireEvent.click(screen.getAllByRole('button', { name: /present/i })[0]!);
    expect(canvasStore().getState().view).not.toEqual({ x: 5, y: 7, scale: 1.5 });
    fireEvent.click(screen.getByRole('button', { name: 'Exit presentation' }));
    expect(canvasStore().getState().view).toEqual({ x: 5, y: 7, scale: 1.5 });
  });
});

describe('BoardPage rename', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('refreshes the dashboard list as well as the open board', async () => {
    const { refetch } = mockQuery({ data: { id: 'b1', title: 'Board', role: 'owner' } as never });
    vi.mocked(boardsApi.renameBoard).mockResolvedValue({} as never);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderPage('b1', client);
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    const input = screen.getByRole('textbox', { name: /board title/i });
    fireEvent.change(input, { target: { value: 'Roadmap' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(boardsApi.renameBoard).toHaveBeenCalledWith('b1', 'Roadmap');
    expect(refetch).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['boards'] });
  });
});
