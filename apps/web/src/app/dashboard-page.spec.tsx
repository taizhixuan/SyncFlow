import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Board } from '@syncflow/shared';
import * as authContext from '@/features/auth/auth-context';
import * as boardsApi from '@/features/boards/api/boards-api';
import { DashboardPage } from './dashboard-page';
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
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app']} future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/app" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
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
    expect(boardsApi.listBoards).toHaveBeenLastCalledWith('c2');
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
});
