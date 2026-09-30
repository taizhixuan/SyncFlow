import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { UserPublic } from '@syncflow/shared';
import * as authContext from '@/features/auth/auth-context';
import type { CanvasStore } from '@/features/canvas/engine/canvas-store';
import { BoardSyncProvider, type BoardSyncOptions } from './socket-sync';
import { useBoardSync, useLaserBroadcast } from './use-board-sync';

vi.mock('./socket-sync', () => ({
  BoardSyncProvider: vi.fn().mockImplementation(() => ({ connect: vi.fn(), destroy: vi.fn() })),
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    whenSynced: Promise.resolve(),
    destroy: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

function fakeStore(): { store: CanvasStore; awareness: Awareness; setClockOffset: ReturnType<typeof vi.fn> } {
  const ydoc = new Y.Doc();
  const awareness = new Awareness(ydoc);
  const state = {
    ydoc,
    awareness,
    selected: [] as string[],
    applyRemote: vi.fn(),
    setConnection: vi.fn(),
    setClockOffset: vi.fn(),
  };
  const store = {
    getState: () => state,
    subscribe: () => () => undefined,
  } as unknown as CanvasStore;
  return { store, awareness, setClockOffset: state.setClockOffset };
}

describe('useBoardSync', () => {
  beforeEach(() => {
    vi.mocked(BoardSyncProvider).mockClear();
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', displayName: 'Ada', color: '#000' } as UserPublic,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
  });

  it('keeps one provider across token refreshes (peers must not see us leave/rejoin)', () => {
    const { store } = fakeStore();
    const { rerender } = renderHook(({ token }) => useBoardSync(store, 'b1', token), {
      initialProps: { token: 'tok-1' as string | null },
    });
    rerender({ token: 'tok-2' });
    rerender({ token: 'tok-3' });
    expect(BoardSyncProvider).toHaveBeenCalledTimes(1);
  });

  it('exposes a terminal server rejection', () => {
    const { store } = fakeStore();
    const { result } = renderHook(() => useBoardSync(store, 'b1', 'tok'));
    expect(result.current.rejection).toBeNull();

    const opts = vi.mocked(BoardSyncProvider).mock.calls[0]![0] as BoardSyncOptions;
    act(() => opts.onRejected?.('forbidden'));

    expect(result.current.rejection).toBe('forbidden');
  });

  it('hands the measured server clock offset to the store', () => {
    const { store, setClockOffset } = fakeStore();
    renderHook(() => useBoardSync(store, 'b1', 'tok'));
    const opts = vi.mocked(BoardSyncProvider).mock.calls[0]![0] as BoardSyncOptions;
    opts.onClockOffset?.(1_234);
    expect(setClockOffset).toHaveBeenCalledWith(1_234);
  });

  it('returns a stable cursor setter', () => {
    const { store } = fakeStore();
    const { result, rerender } = renderHook(({ token }) => useBoardSync(store, 'b1', token), {
      initialProps: { token: 'a' as string | null },
    });
    const first = result.current.setCursor;
    rerender({ token: 'b' });
    expect(result.current.setCursor).toBe(first);
  });
});

describe('useLaserBroadcast', () => {
  it('does not re-emit awareness when clearing an already-cleared laser', () => {
    const { store, awareness } = fakeStore();
    const updates = vi.fn();
    awareness.on('update', updates);
    const { result } = renderHook(() => useLaserBroadcast(store, 'b1', 'tok'));

    result.current({ x: 1, y: 2 });
    result.current(null);
    const afterFirstClear = updates.mock.calls.length;
    result.current(null);
    result.current(null);

    expect(updates.mock.calls.length).toBe(afterFirstClear);
    expect(awareness.getLocalState()?.laser).toBeNull();
  });
});
