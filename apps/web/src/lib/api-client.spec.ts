import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api-client';

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
});
