import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as invitesApi from '../api/invites-api';
import * as authContext from '@/features/auth/auth-context';
import { InviteAcceptPage } from './invite-accept-page';

vi.mock('../api/invites-api');
vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/invite/test-token']}>
        <Routes>
          <Route path="/invite/:token" element={<InviteAcceptPage />} />
          <Route path="/app/board/:boardId" element={<div data-testid="board-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InviteAcceptPage', () => {
  beforeEach(() => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'anonymous',
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('shows loading state while preview is pending', () => {
    vi.mocked(invitesApi.getInvitePreview).mockReturnValue(new Promise(() => undefined));
    renderPage(makeClient());
    expect(screen.getByText(/loading invite/i)).toBeInTheDocument();
  });

  it('shows invalid message when preview returns valid: false', async () => {
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: false });
    renderPage(makeClient());
    expect(
      await screen.findByText(/invalid or has expired/i),
    ).toBeInTheDocument();
  });

  it('shows board title and log-in link for anonymous users with a valid invite', async () => {
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({
      valid: true,
      boardTitle: 'My Board',
      role: 'editor',
      inviterName: 'Alice',
    });
    renderPage(makeClient());

    expect(await screen.findByText('My Board')).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in to join/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('shows Accept invite button and calls acceptInvite on click for authenticated users', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', email: 'user@test.com', displayName: 'User', color: '#aabbcc', createdAt: '2026-01-01T00:00:00.000Z' },
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({
      valid: true,
      boardTitle: 'Collab Board',
      role: 'editor',
      inviterName: 'Bob',
    });
    vi.mocked(invitesApi.acceptInvite).mockResolvedValue({ boardId: 'board-123', role: 'editor' });

    renderPage(makeClient());

    const acceptBtn = await screen.findByRole('button', { name: /accept invite/i });
    expect(acceptBtn).toBeInTheDocument();

    await userEvent.click(acceptBtn);
    expect(vi.mocked(invitesApi.acceptInvite)).toHaveBeenCalledWith('test-token');

    // After a successful accept the user should be navigated to the board page.
    expect(await screen.findByTestId('board-page')).toBeInTheDocument();
  });
});
