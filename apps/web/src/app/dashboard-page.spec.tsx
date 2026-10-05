import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Board } from '@syncflow/shared';
import * as authContext from '@/features/auth/auth-context';
import * as boardsApi from '@/features/boards/api/boards-api';
import { DashboardPage } from './dashboard-page';
import { ThemeProvider } from './theme';
import { ROUTER_FUTURE } from './router-future';

vi.mock('@/features/boards/api/boards-api');
vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

const board: Board = {
  id: 'b1',
  title: 'Roadmap',
  role: 'owner',
  memberCount: 1,
  isPublic: false,
  thumbnailUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Board;

function renderDashboard(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/app']} future={ROUTER_FUTURE}>
          <Routes>
            <Route path="/app" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return client;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'authenticated',
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    vi.mocked(boardsApi.listBoards).mockResolvedValue({ items: [board], nextCursor: null });
  });

  it('names the log out button even where its text label is hidden (phones)', () => {
    renderDashboard();
    expect(screen.getByRole('button', { name: 'Log out' })).toHaveAttribute('aria-label', 'Log out');
  });

  it('surfaces a failed board creation', async () => {
    vi.mocked(boardsApi.createBoard).mockRejectedValue(new Error('boom'));
    renderDashboard();
    await screen.findByText('Roadmap');

    await userEvent.click(screen.getAllByRole('button', { name: /new board/i })[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t create/i);
  });

  it('confirms a delete inline (never window.confirm) and cancel keeps the board', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /delete roadmap/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(boardsApi.deleteBoard).not.toHaveBeenCalled();
    expect(screen.getByText(/delete .roadmap.\? this cannot be undone/i)).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(cancel).toHaveFocus();

    await userEvent.click(cancel);
    expect(boardsApi.deleteBoard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /delete roadmap/i })).toHaveFocus();
  });

  it('surfaces a failed delete', async () => {
    vi.mocked(boardsApi.deleteBoard).mockRejectedValue(new Error('boom'));
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /delete roadmap/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm delete roadmap/i }));
    expect(boardsApi.deleteBoard).toHaveBeenCalledWith('b1');

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t delete/i);
  });

  it('keeps the delete control reachable by keyboard and touch (not display:none)', async () => {
    renderDashboard();
    const del = await screen.findByRole('button', { name: /delete roadmap/i });
    expect(del).not.toHaveClass('hidden');
    expect(del).toHaveClass('opacity-0', 'focus-visible:opacity-100', '[@media(hover:none)]:opacity-100');
  });

  it('duplicates a board and refreshes the list', async () => {
    vi.mocked(boardsApi.duplicateBoard).mockResolvedValue({ ...board, id: 'b2', title: 'Roadmap (copy)' });
    const client = renderDashboard();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await userEvent.click(await screen.findByRole('button', { name: /duplicate roadmap/i }));

    expect(boardsApi.duplicateBoard).toHaveBeenCalledWith('b1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['boards'] });
  });

  it('surfaces a failed duplicate', async () => {
    vi.mocked(boardsApi.duplicateBoard).mockRejectedValue(new Error('boom'));
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /duplicate roadmap/i }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/couldn.t duplicate/i)).toBeInTheDocument();
  });

  it('loads more boards on demand and keeps the pages together', async () => {
    vi.mocked(boardsApi.listBoards)
      .mockResolvedValueOnce({ items: [board], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [{ ...board, id: 'b2', title: 'Retro' }], nextCursor: null });
    renderDashboard();
    await screen.findByText('Roadmap');

    await userEvent.click(screen.getByRole('button', { name: /load more boards/i }));

    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(boardsApi.listBoards).toHaveBeenLastCalledWith('c2', {});
    expect(screen.queryByRole('button', { name: /load more boards/i })).not.toBeInTheDocument();
  });

  it('surfaces a failed next page with a retry', async () => {
    vi.mocked(boardsApi.listBoards)
      .mockResolvedValueOnce({ items: [board], nextCursor: 'c2' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ items: [{ ...board, id: 'b2', title: 'Retro' }], nextCursor: null });
    renderDashboard();
    await userEvent.click(await screen.findByRole('button', { name: /load more boards/i }));

    expect(await screen.findByText(/couldn.t load more boards/i)).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /load more boards/i }));
    expect(await screen.findByText('Retro')).toBeInTheDocument();
  });

  it('shows an empty state when there are no boards', async () => {
    vi.mocked(boardsApi.listBoards).mockResolvedValue({ items: [], nextCursor: null });
    renderDashboard();
    expect(await screen.findByText(/create your first board/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load more boards/i })).not.toBeInTheDocument();
  });

  it('offers no leave action on boards you own', async () => {
    renderDashboard();
    await screen.findByText('Roadmap');
    expect(screen.queryByRole('button', { name: /leave roadmap/i })).not.toBeInTheDocument();
  });

  it('leaves a shared board after an inline confirm and refreshes the list', async () => {
    vi.mocked(boardsApi.listBoards).mockResolvedValue({
      items: [{ ...board, role: 'editor' }],
      nextCursor: null,
    });
    let resolve: () => void = () => undefined;
    vi.mocked(boardsApi.leaveBoard).mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const client = renderDashboard();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    expect(await screen.findByText('Roadmap')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete roadmap/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /leave roadmap/i }));
    expect(boardsApi.leaveBoard).not.toHaveBeenCalled();
    expect(screen.getByText(/leave .roadmap.\?/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirm leave roadmap/i }));
    expect(boardsApi.leaveBoard).toHaveBeenCalledWith('b1');
    expect(screen.getByRole('button', { name: /confirm leave roadmap/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /confirm leave roadmap/i })).toHaveTextContent(/leaving/i);

    resolve();
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['boards'] }));
  });

  it('surfaces a failed leave', async () => {
    vi.mocked(boardsApi.listBoards).mockResolvedValue({
      items: [{ ...board, role: 'viewer' }],
      nextCursor: null,
    });
    vi.mocked(boardsApi.leaveBoard).mockRejectedValue(new Error('boom'));
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /leave roadmap/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm leave roadmap/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t leave .roadmap./i);
  });

  it('tracks overlapping deletes per board and surfaces the earlier one failing', async () => {
    vi.mocked(boardsApi.listBoards).mockResolvedValue({
      items: [board, { ...board, id: 'b2', title: 'Retro' }],
      nextCursor: null,
    });
    let failFirst: (err: Error) => void = () => undefined;
    vi.mocked(boardsApi.deleteBoard).mockImplementation((id) =>
      id === 'b1'
        ? new Promise<void>((_resolve, reject) => {
            failFirst = reject;
          })
        : new Promise<void>(() => undefined),
    );
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /delete roadmap/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm delete roadmap/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete retro/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm delete retro/i }));

    // Both stay pending: the second delete must not steal the first one's spinner.
    expect(screen.getByRole('button', { name: /confirm delete roadmap/i })).toHaveTextContent(/deleting/i);
    expect(screen.getByRole('button', { name: /confirm delete retro/i })).toHaveTextContent(/deleting/i);

    failFirst(new Error('boom'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t delete .roadmap./i);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /^delete roadmap$/i })).toBeEnabled());
    expect(screen.getByRole('button', { name: /confirm delete retro/i })).toHaveTextContent(/deleting/i);
  });

  it('keeps every failure when overlapping actions fail', async () => {
    vi.mocked(boardsApi.listBoards).mockResolvedValue({
      items: [board, { ...board, id: 'b2', title: 'Retro' }],
      nextCursor: null,
    });
    const rejecters: Array<(err: Error) => void> = [];
    vi.mocked(boardsApi.duplicateBoard).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejecters.push(reject);
        }),
    );
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /duplicate roadmap/i }));
    await userEvent.click(screen.getByRole('button', { name: /duplicate retro/i }));
    rejecters.forEach((reject) => reject(new Error('boom')));

    await vi.waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.getByText(/couldn.t duplicate .roadmap./i)).toBeInTheDocument();
    expect(screen.getByText(/couldn.t duplicate .retro./i)).toBeInTheDocument();
  });
});

describe('DashboardPage layout and narrowing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'authenticated',
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    // The server does the narrowing; this stands in for it.
    const all = [board, { ...board, id: 'b2', title: 'Retro', role: 'editor' as const }];
    vi.mocked(boardsApi.listBoards).mockImplementation(async (_cursor, filter = {}) => ({
      items: all.filter(
        (b) =>
          (!filter.role || (filter.role === 'owned') === (b.role === 'owner')) &&
          (!filter.q || b.title.toLowerCase().includes(filter.q.toLowerCase())),
      ),
      nextCursor: null,
    }));
  });

  it('switches to the list view, keeps every action, and remembers the choice', async () => {
    renderDashboard();
    await screen.findByText('Roadmap');
    await userEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^open roadmap$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete roadmap/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /leave retro/i })).toBeInTheDocument();
    expect(localStorage.getItem('syncflow:boards-view')).toBe('list');
  });

  it('narrows by search and by ownership, and says when nothing matches', async () => {
    renderDashboard();
    await screen.findByText('Roadmap');

    await userEvent.type(screen.getByRole('searchbox', { name: /search boards/i }), 'retro');
    await vi.waitFor(() => expect(screen.queryByText('Roadmap')).toBeNull());
    expect(screen.getByText('Retro')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Owned by me' }));
    expect(await screen.findByText(/no boards match “retro”/i)).toBeInTheDocument();
  });

  it('asks the server, so a match on a page not loaded yet is still found', async () => {
    vi.mocked(boardsApi.listBoards).mockImplementation(async (_cursor, filter = {}) =>
      filter.q || filter.role
        ? { items: [{ ...board, id: 'b9', title: 'Retro', role: 'editor' }], nextCursor: null }
        : { items: [board], nextCursor: 'c2' },
    );
    renderDashboard();
    await screen.findByText('Roadmap');

    await userEvent.type(screen.getByRole('searchbox', { name: /search boards/i }), 'retro');
    expect(await screen.findByText('Retro')).toBeInTheDocument();
    expect(boardsApi.listBoards).toHaveBeenLastCalledWith(null, { q: 'retro' });
    expect(screen.queryByText(/no boards match/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Shared with me' }));
    await vi.waitFor(() =>
      expect(boardsApi.listBoards).toHaveBeenLastCalledWith(null, { role: 'shared', q: 'retro' }),
    );
  });

  it('debounces the search so typing sends one request, not one per keystroke', async () => {
    renderDashboard();
    await screen.findByText('Roadmap');
    vi.mocked(boardsApi.listBoards).mockClear();

    await userEvent.type(screen.getByRole('searchbox', { name: /search boards/i }), 'ret');
    await vi.waitFor(() => expect(screen.queryByText('Roadmap')).toBeNull());
    expect(boardsApi.listBoards).toHaveBeenCalledTimes(1);
    expect(boardsApi.listBoards).toHaveBeenCalledWith(null, { q: 'ret' });
  });
});
