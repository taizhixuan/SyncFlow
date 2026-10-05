import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthResponse, UserPublic } from '@syncflow/shared';
import { api } from '@/lib/api';
import * as authApi from './api/auth-api';
import { AuthProvider, useAuth, useSessionProbe } from './auth-context';

vi.mock('./api/auth-api');

const ada = { id: 'u1', email: 'ada@x.io', displayName: 'Ada', color: '#000' } as UserPublic;
const bob = { id: 'u2', email: 'bob@x.io', displayName: 'Bob', color: '#fff' } as UserPublic;

let ctx: ReturnType<typeof useAuth> | null = null;
let probe: ReturnType<typeof useSessionProbe> | null = null;
function Probe(): JSX.Element {
  ctx = useAuth();
  probe = useSessionProbe();
  return <span data-testid="status">{ctx.status}</span>;
}

function renderAuth(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const status = (): string => screen.getByTestId('status').textContent ?? '';

describe('AuthProvider', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
    ctx = null;
    localStorage.clear();
  });

  afterEach(() => {
    api.setAccessToken(null);
    vi.resetAllMocks();
  });

  it('leaves "loading" for "error" when the session restore rejects, and can retry', async () => {
    vi.mocked(authApi.restoreSession).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderAuth(client);
    await waitFor(() => expect(status()).toBe('error'));

    vi.mocked(authApi.restoreSession).mockResolvedValueOnce(ada);
    act(() => ctx!.retry());
    await waitFor(() => expect(status()).toBe('authenticated'));
    expect(ctx!.user?.id).toBe('u1');
  });

  it('logs out locally even when the server call fails, without rejecting', async () => {
    vi.mocked(authApi.restoreSession).mockResolvedValue(ada);
    vi.mocked(authApi.logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderAuth(client);
    await waitFor(() => expect(status()).toBe('authenticated'));
    client.setQueryData(['boards'], { items: [{ id: 'ada-board' }] });

    await act(() => ctx!.logout());

    expect(status()).toBe('anonymous');
    expect(ctx!.user).toBeNull();
    expect(client.getQueryData(['boards'])).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("clears the previous user's cached data before a new user logs in", async () => {
    vi.mocked(authApi.restoreSession).mockResolvedValue(null);
    vi.mocked(authApi.login).mockResolvedValue({ accessToken: 't', user: bob } as AuthResponse);
    renderAuth(client);
    await waitFor(() => expect(status()).toBe('anonymous'));
    client.setQueryData(['boards'], { items: [{ id: 'ada-board' }] });

    await act(() => ctx!.login('bob@x.io', 'pw'));

    expect(client.getQueryData(['boards'])).toBeUndefined();
    expect(ctx!.user?.id).toBe('u2');
  });

  it('clears the cache on signup too', async () => {
    vi.mocked(authApi.restoreSession).mockResolvedValue(null);
    vi.mocked(authApi.signup).mockResolvedValue({ accessToken: 't', user: bob } as AuthResponse);
    renderAuth(client);
    await waitFor(() => expect(status()).toBe('anonymous'));
    client.setQueryData(['boards'], { items: [{ id: 'ada-board' }] });

    await act(() => ctx!.signup('bob@x.io', 'pw', 'Bob'));

    expect(client.getQueryData(['boards'])).toBeUndefined();
  });

  it('becomes anonymous when the access token is lost mid-session (refresh failed)', async () => {
    vi.mocked(authApi.restoreSession).mockImplementation(async () => {
      api.setAccessToken('live');
      return ada;
    });
    renderAuth(client);
    await waitFor(() => expect(status()).toBe('authenticated'));
    client.setQueryData(['boards'], { items: [{ id: 'ada-board' }] });

    act(() => api.setAccessToken(null));

    expect(status()).toBe('anonymous');
    expect(client.getQueryData(['boards'])).toBeUndefined();
  });

  describe('account switched in another tab', () => {
    // The refresh cookie is shared by every tab: once another tab signs in as
    // Bob, this tab's next refresh is Bob's session even though it shows Ada.
    async function refreshAs(user: UserPublic): Promise<void> {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ accessToken: `${user.id}-token`, expiresIn: 900, user }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      await act(async () => {
        await api.refreshSession();
      });
      fetchSpy.mockRestore();
    }

    it("switches to the refreshed account and drops the previous user's cache", async () => {
      vi.mocked(authApi.restoreSession).mockResolvedValue(ada);
      renderAuth(client);
      await waitFor(() => expect(status()).toBe('authenticated'));
      client.setQueryData(['boards'], { items: [{ id: 'ada-board' }] });

      await refreshAs(bob);

      expect(ctx!.user?.id).toBe('u2');
      expect(status()).toBe('authenticated');
      expect(client.getQueryData(['boards'])).toBeUndefined();
    });

    it('keeps the cache when a refresh returns the same account', async () => {
      vi.mocked(authApi.restoreSession).mockResolvedValue(ada);
      renderAuth(client);
      await waitFor(() => expect(status()).toBe('authenticated'));
      client.setQueryData(['boards'], { items: [{ id: 'ada-board' }] });

      await refreshAs(ada);

      expect(ctx!.user?.id).toBe('u1');
      expect(client.getQueryData(['boards'])).toEqual({ items: [{ id: 'ada-board' }] });
    });
  });

  describe('session hint', () => {
    it('skips the session probe when this browser is known to be signed out', async () => {
      localStorage.setItem('syncflow:session', '0');
      renderAuth(client);
      await waitFor(() => expect(status()).toBe('anonymous'));
      expect(authApi.restoreSession).not.toHaveBeenCalled();
      expect(probe!.unconfirmed).toBe(true);
    });

    // The hint lives per web origin, the session cookie per API host, so a
    // stale hint must not lock a signed-in user out of protected pages.
    it('asks the server once when a protected page needs the hint confirmed', async () => {
      localStorage.setItem('syncflow:session', '0');
      vi.mocked(authApi.restoreSession).mockResolvedValueOnce(ada);
      renderAuth(client);
      await waitFor(() => expect(status()).toBe('anonymous'));

      act(() => probe!.confirm());

      await waitFor(() => expect(status()).toBe('authenticated'));
      expect(authApi.restoreSession).toHaveBeenCalledOnce();
      expect(probe!.unconfirmed).toBe(false);
      expect(localStorage.getItem('syncflow:session')).toBe('1');
    });

    it('treats a server-confirmed signed-out state as settled', async () => {
      vi.mocked(authApi.restoreSession).mockResolvedValueOnce(null);
      renderAuth(client);
      await waitFor(() => expect(status()).toBe('anonymous'));
      expect(probe!.unconfirmed).toBe(false);

      act(() => probe!.confirm());
      expect(status()).toBe('anonymous');
      expect(authApi.restoreSession).toHaveBeenCalledOnce();
    });

    it('still probes when there is no hint yet, so sessions from before it survive', async () => {
      vi.mocked(authApi.restoreSession).mockResolvedValueOnce(ada);
      renderAuth(client);
      await waitFor(() => expect(status()).toBe('authenticated'));
      expect(localStorage.getItem('syncflow:session')).toBe('1');
    });

    it('records a sign-in and a sign-out', async () => {
      localStorage.setItem('syncflow:session', '0');
      vi.mocked(authApi.login).mockResolvedValueOnce({ accessToken: 't', user: ada } as AuthResponse);
      vi.mocked(authApi.logout).mockResolvedValueOnce(undefined);
      renderAuth(client);
      await waitFor(() => expect(status()).toBe('anonymous'));
      await act(() => ctx!.login('ada@x.io', 'pw'));
      expect(localStorage.getItem('syncflow:session')).toBe('1');
      await act(() => ctx!.logout());
      expect(localStorage.getItem('syncflow:session')).toBe('0');
    });
  });
});
