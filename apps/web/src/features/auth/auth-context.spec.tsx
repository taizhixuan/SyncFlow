import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthResponse, UserPublic } from '@syncflow/shared';
import { api } from '@/lib/api';
import * as authApi from './api/auth-api';
import { AuthProvider, useAuth } from './auth-context';

vi.mock('./api/auth-api');

const ada = { id: 'u1', email: 'ada@x.io', displayName: 'Ada', color: '#000' } as UserPublic;
const bob = { id: 'u2', email: 'bob@x.io', displayName: 'Bob', color: '#fff' } as UserPublic;

let ctx: ReturnType<typeof useAuth> | null = null;
function Probe(): JSX.Element {
  ctx = useAuth();
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
});
