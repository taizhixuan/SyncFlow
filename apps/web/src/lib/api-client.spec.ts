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
