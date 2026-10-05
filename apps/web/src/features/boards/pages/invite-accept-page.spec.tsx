import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/app/router-future';
import * as invitesApi from '../api/invites-api';
import * as authContext from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { InviteAcceptPage } from './invite-accept-page';

vi.mock('../api/invites-api');
vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn(), useSessionProbe: vi.fn() };
});

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/invite/test-token']} future={ROUTER_FUTURE}>
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
    vi.resetAllMocks();
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'anonymous',
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    vi.mocked(authContext.useSessionProbe).mockReturnValue({ unconfirmed: false, confirm: vi.fn() });
  });

  it('asks the server once before calling a hint-only signed-out visitor anonymous', async () => {
    // The signed-out hint is per web origin and can be stale; "Log in" would be wrong.
    const confirm = vi.fn();
    vi.mocked(authContext.useSessionProbe).mockReturnValue({ unconfirmed: true, confirm });
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: true, boardTitle: 'B' });
    renderPage(makeClient());
    expect(await screen.findByText(/checking your session/i)).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link', { name: /log in/i })).toBeNull();
  });

  it('spends no session request on a link that is invalid anyway', async () => {
    const confirm = vi.fn();
    vi.mocked(authContext.useSessionProbe).mockReturnValue({ unconfirmed: true, confirm });
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: false });
    renderPage(makeClient());
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
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
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({
      valid: true,
      boardTitle: 'Collab Board',
      role: 'editor',
      inviterName: 'Bob',
    });
    vi.mocked(invitesApi.acceptInvite).mockResolvedValue({ boardId: 'board-123', role: 'editor' });

    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderPage(client);

    const acceptBtn = await screen.findByRole('button', { name: /accept invite/i });
    expect(acceptBtn).toBeInTheDocument();

    await userEvent.click(acceptBtn);
    expect(vi.mocked(invitesApi.acceptInvite)).toHaveBeenCalledWith('test-token');

    // After a successful accept the user should be navigated to the board page.
    expect(await screen.findByTestId('board-page')).toBeInTheDocument();
    // The dashboard must list the newly joined board, not a stale cache.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['boards'] });
  });

  it('offers a retry when the session check failed', async () => {
    const retry = vi.fn();
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'error',
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry,
    });
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: true, boardTitle: 'B' });
    renderPage(makeClient());

    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });

  describe('when accepting fails', () => {
    beforeEach(() => {
      vi.mocked(authContext.useAuth).mockReturnValue({
        status: 'authenticated',
        user: { id: 'u1', email: 'me@test.com', displayName: 'Me', color: '#aabbcc', createdAt: '2026-01-01T00:00:00.000Z' },
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
        updateUser: vi.fn(),
        retry: vi.fn(),
      });
      vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: true, boardTitle: 'B', kind: 'email' });
    });

    async function acceptFailingWith(status: number): Promise<HTMLElement> {
      vi.mocked(invitesApi.acceptInvite).mockRejectedValue(new ApiError(status, 'nope'));
      renderPage(makeClient());
      await userEvent.click(await screen.findByRole('button', { name: /accept invite/i }));
      return screen.findByRole('alert');
    }

    it('says the invite is for another email and names the signed-in account (403)', async () => {
      const alert = await acceptFailingWith(403);
      expect(alert).toHaveTextContent(/different email/i);
      expect(alert).toHaveTextContent('me@test.com');
    });

    it('says the invite was already used or has expired (410)', async () => {
      expect(await acceptFailingWith(410)).toHaveTextContent(/already been used or has expired/i);
    });

    it('says the link is no longer valid (404)', async () => {
      expect(await acceptFailingWith(404)).toHaveTextContent(/no longer valid/i);
    });

    it('offers a retry for anything else', async () => {
      expect(await acceptFailingWith(500)).toHaveTextContent(/couldn.t accept the invite\. please try again/i);
    });
  });

  it('routes an existing member in from an already-used invite', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', email: 'me@test.com', displayName: 'Me', color: '#aabbcc', createdAt: '2026-01-01T00:00:00.000Z' },
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: false, used: true });
    vi.mocked(invitesApi.acceptInvite).mockResolvedValue({ boardId: 'board-123', role: 'viewer' });
    renderPage(makeClient());

    expect(await screen.findByText(/already been used/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid or has expired/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open board/i }));
    expect(await screen.findByTestId('board-page')).toBeInTheDocument();
  });

  it('asks an anonymous visitor with an already-used invite to log in first', async () => {
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: false, used: true });
    renderPage(makeClient());
    expect(await screen.findByText(/already been used/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login?returnTo=%2Finvite%2Ftest-token');
  });

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['a server error', new ApiError(500, 'boom')],
    ['rate limiting', new ApiError(429, 'slow down')],
  ])('does not call the invite invalid after %s, and retries', async (_label, error) => {
    vi.mocked(invitesApi.getInvitePreview)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ valid: true, boardTitle: 'Recovered' });
    renderPage(makeClient());

    expect(await screen.findByText(/couldn.t load this invite/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid or has expired/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('says an expired invite has expired', async () => {
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: false, expired: true });
    renderPage(makeClient());
    expect(await screen.findByText(/this invite has expired/i)).toBeInTheDocument();
  });

  it('encodes returnTo on the log-in link', async () => {
    vi.mocked(invitesApi.getInvitePreview).mockResolvedValue({ valid: true, boardTitle: 'B' });
    renderPage(makeClient());
    expect(await screen.findByRole('link', { name: /log in to join/i })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Finvite%2Ftest-token',
    );
  });
});
