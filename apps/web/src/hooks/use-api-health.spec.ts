import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { HEALTHY_POLL_MS, UNHEALTHY_POLL_MS, useApiHealth } from './use-api-health';

const healthy = {
  status: 'ok',
  service: 'syncflow-api',
  version: '1.0.0',
  uptimeSeconds: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  details: { database: 'up', redis: 'up' },
};

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useApiHealth', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(healthy), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('backs off to a slow poll while the API is healthy', async () => {
    const { result } = renderHook(() => useApiHealth());
    await flush();
    expect(result.current.state.phase).toBe('ready');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(UNHEALTHY_POLL_MS);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(HEALTHY_POLL_MS - UNHEALTHY_POLL_MS);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not poll while the tab is hidden, and checks again when it returns', async () => {
    renderHook(() => useApiHealth());
    await flush();
    act(() => setVisibility('hidden'));

    await act(async () => {
      vi.advanceTimersByTime(HEALTHY_POLL_MS * 3);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('aborts a manual refresh when the component unmounts', async () => {
    const { result, unmount } = renderHook(() => useApiHealth());
    await flush();
    act(() => result.current.refresh());
    const init = fetchSpy.mock.calls.at(-1)![1] as RequestInit;
    unmount();
    expect(init.signal?.aborted).toBe(true);
  });
});
