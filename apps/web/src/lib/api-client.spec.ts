import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, type RefreshChannel, type RefreshLocks } from './api-client';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ApiClient', () => {
  it('attaches the bearer token to requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ ok: true }));
    const client = new ApiClient('/api/v1', fetchImpl);
    client.setAccessToken('tok-123');

    await client.get('/users/me');

    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('refreshes once on 401 and retries the original request', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ message: 'unauthorized' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'new-tok', expiresIn: 900, user: {} }, 200))
      .mockResolvedValueOnce(json({ id: 'u1' }, 200));
    const client = new ApiClient('/api/v1', fetchImpl);
    client.setAccessToken('old-tok');

    const result = await client.get<{ id: string }>('/users/me');

    expect(result.id).toBe('u1');
    expect(client.getAccessToken()).toBe('new-tok');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws ApiError with the status when refresh also fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ message: 'unauthorized' }, 401))
      .mockResolvedValueOnce(json({ message: 'no' }, 401));
    const client = new ApiClient('/api/v1', fetchImpl);
    client.setAccessToken('old-tok');

    await expect(client.get('/users/me')).rejects.toBeInstanceOf(ApiError);
  });

  it('deduplicates concurrent refreshes into a single request', async () => {
    // Two callers refresh at the same time (e.g. StrictMode double-mount). They
    // must share ONE POST /auth/refresh — otherwise the second presents the same
    // rotating token, the server flags reuse and revokes the whole family.
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        refreshCalls += 1;
        return json({ accessToken: 'fresh', user: { id: 'u1' } }, 200);
      }
      return json({ ok: true }, 200);
    });
    const client = new ApiClient('/api/v1', fetchImpl as unknown as typeof fetch);

    const [a, b] = await Promise.all([client.refreshSession(), client.refreshSession()]);

    expect(refreshCalls).toBe(1);
    expect(a).toEqual(b);
    expect(client.getAccessToken()).toBe('fresh');
    // A later refresh runs fresh (the in-flight handle is cleared once settled).
    await client.refreshSession();
    expect(refreshCalls).toBe(2);
  });

  it('turns a non-JSON error page (a proxy 502) into an ApiError, not a SyntaxError', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    const client = new ApiClient('/api/v1', fetchImpl);

    const error = await client.get('/boards').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toBe('Bad Gateway');
  });

  it('uses global fetch by default (default fetch path is wired)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true }));
    const client = new ApiClient('/api/v1');
    await client.get('/ping');
    expect(spy).toHaveBeenCalledWith('/api/v1/ping', expect.objectContaining({ method: 'GET' }));
    spy.mockRestore();
  });

  it('does not attempt refresh for the login endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ message: 'bad creds' }, 401));
    const client = new ApiClient('/api/v1', fetchImpl);

    await expect(client.post('/auth/login', { email: 'a', password: 'b' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  describe('token-change emitter', () => {
    it('notifies every subscriber and stops after unsubscribe', () => {
      const client = new ApiClient('/api/v1', vi.fn(), { locks: null, channel: null });
      const a = vi.fn();
      const b = vi.fn();
      const offA = client.onTokenChange(a);
      client.onTokenChange(b);

      client.setAccessToken('t1');
      offA();
      client.setAccessToken(null);

      expect(a.mock.calls).toEqual([['t1']]);
      expect(b.mock.calls).toEqual([['t1'], [null]]);
    });

    it('notifies null when a refresh is rejected by the server', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(json({ message: 'no' }, 401));
      const client = new ApiClient('/api/v1', fetchImpl, { locks: null, channel: null });
      client.setAccessToken('old');
      const listener = vi.fn();
      client.onTokenChange(listener);

      await expect(client.refreshSession()).resolves.toBeNull();
      expect(listener).toHaveBeenCalledWith(null);
    });
  });

  // Tabs share one refresh cookie. If another tab signs in as someone else, this
  // tab's next refresh silently comes back as that account.
  describe('account switches behind a refresh', () => {
    const asBob = { accessToken: 'bob-token', user: { id: 'u2', displayName: 'Bob' } };

    it('reports the user a refresh hands back', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(json(asBob));
      const client = new ApiClient('/api/v1', fetchImpl, { locks: null, channel: null });
      const listener = vi.fn();
      client.onSessionUser(listener);

      await client.refreshSession();

      expect(listener).toHaveBeenCalledWith(asBob.user);
    });

    it('does not replay a request as a different account than the one that sent it', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(json({ message: 'unauthorized' }, 401))
        .mockResolvedValueOnce(json(asBob));
      const client = new ApiClient('/api/v1', fetchImpl, { locks: null, channel: null });
      client.setAccessToken('ada-token', 'u1');

      await expect(client.patch('/boards/b1', { title: 'x' })).rejects.toMatchObject({ status: 401 });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(client.getAccessToken()).toBe('bob-token');
    });

    it('still replays the request when the refresh keeps the same account', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(json({ message: 'unauthorized' }, 401))
        .mockResolvedValueOnce(json({ accessToken: 'ada-2', user: { id: 'u1' } }))
        .mockResolvedValueOnce(json({ ok: true }));
      const client = new ApiClient('/api/v1', fetchImpl, { locks: null, channel: null });
      client.setAccessToken('ada-token', 'u1');

      await expect(client.get('/boards')).resolves.toEqual({ ok: true });
    });
  });

  describe('refresh failures that are not auth failures', () => {
    it('rejects (instead of hanging) when the network fails, keeping the token', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const client = new ApiClient('/api/v1', fetchImpl, { locks: null, channel: null });
      client.setAccessToken('keep');

      await expect(client.refreshSession()).rejects.toThrow('Failed to fetch');
      expect(client.getAccessToken()).toBe('keep');
    });

    it('rejects on a 5xx (cold start) without logging the user out', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(json({ message: 'bad gateway' }, 502));
      const client = new ApiClient('/api/v1', fetchImpl, { locks: null, channel: null });
      client.setAccessToken('keep');

      await expect(client.refreshSession()).rejects.toBeInstanceOf(ApiError);
      expect(client.getAccessToken()).toBe('keep');
    });

    it('surfaces the original 401 when the transparent refresh cannot reach the server', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(json({ message: 'unauthorized' }, 401))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const client = new ApiClient('/api/v1', fetchImpl, { locks: null, channel: null });

      await expect(client.get('/boards')).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('cross-tab refresh', () => {
    function fakeLocks(): RefreshLocks {
      let tail: Promise<unknown> = Promise.resolve();
      return {
        request<T>(_name: string, cb: () => Promise<T>): Promise<T> {
          const run = tail.then(cb);
          tail = run.catch(() => undefined);
          return run;
        },
      };
    }

    function channelPair(): [RefreshChannel, RefreshChannel] {
      const listeners: Array<Array<(e: MessageEvent) => void>> = [[], []];
      const make = (self: number, other: number): RefreshChannel => ({
        postMessage: (data: unknown) => {
          for (const l of listeners[other]!) l(new MessageEvent('message', { data }));
        },
        addEventListener: (_type, l) => {
          listeners[self]!.push(l);
        },
      });
      return [make(0, 1), make(1, 0)];
    }

    it('shares one rotation between tabs instead of presenting the cookie twice', async () => {
      const locks = fakeLocks();
      const [chanA, chanB] = channelPair();
      let refreshCalls = 0;
      const fetchImpl = vi.fn(async () => {
        refreshCalls += 1;
        return json({ accessToken: `tok-${refreshCalls}`, user: { id: 'u1' } }, 200);
      });
      const tabA = new ApiClient('/api/v1', fetchImpl as unknown as typeof fetch, { locks, channel: chanA });
      const tabB = new ApiClient('/api/v1', fetchImpl as unknown as typeof fetch, { locks, channel: chanB });

      const [a, b] = await Promise.all([tabA.refreshSession(), tabB.refreshSession()]);

      expect(refreshCalls).toBe(1);
      expect(a?.accessToken).toBe('tok-1');
      expect(b?.accessToken).toBe('tok-1');
      expect(tabB.getAccessToken()).toBe('tok-1');
    });

    it("reports the user of a session adopted from another tab's refresh", async () => {
      const locks = fakeLocks();
      const [chanA, chanB] = channelPair();
      const fetchImpl = vi.fn(async () => json({ accessToken: 'bob-token', user: { id: 'u2' } }));
      const tabA = new ApiClient('/api/v1', fetchImpl as unknown as typeof fetch, { locks, channel: chanA });
      const tabB = new ApiClient('/api/v1', fetchImpl as unknown as typeof fetch, { locks, channel: chanB });
      const listener = vi.fn();
      tabB.onSessionUser(listener);

      await Promise.all([tabA.refreshSession(), tabB.refreshSession()]);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ id: 'u2' });
    });

    it('refreshes normally when no other tab refreshed while waiting', async () => {
      const locks = fakeLocks();
      const [chanA] = channelPair();
      const fetchImpl = vi.fn().mockResolvedValue(json({ accessToken: 'fresh', user: {} }, 200));
      const tab = new ApiClient('/api/v1', fetchImpl, { locks, channel: chanA });

      await expect(tab.refreshSession()).resolves.toMatchObject({ accessToken: 'fresh' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });
});
