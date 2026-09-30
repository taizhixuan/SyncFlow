import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
      <MemoryRouter future={ROUTER_FUTURE}>
        <DashboardPage />
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
    vi.mocked(boardsApi.listBoards).mockResolvedValue({ items: [board] });
  });

  it('surfaces a failed board creation', async () => {
    vi.mocked(boardsApi.createBoard).mockRejectedValue(new Error('boom'));
    renderDashboard();
    await screen.findByText('Roadmap');

    await userEvent.click(screen.getAllByRole('button', { name: /new board/i })[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t create/i);
  });

  it('surfaces a failed delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(boardsApi.deleteBoard).mockRejectedValue(new Error('boom'));
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /delete roadmap/i }));

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
});
