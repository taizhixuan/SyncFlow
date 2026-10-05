import * as Y from 'yjs';
import { MAX_FLUSH_WAIT_MS, RoomManager, type Room } from './room-manager';

function makeSnapshotSvc() {
  return {
    loadLatest: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RoomManager', () => {
  it('hydrates a new room from the latest snapshot', async () => {
    const seed = new Y.Doc();
    seed.getMap('elements').set('a', new Y.Map());
    const snap = makeSnapshotSvc();
    snap.loadLatest.mockResolvedValue(Y.encodeStateAsUpdate(seed));
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.getOrCreate('b1');
    expect(room.ydoc.getMap('elements').has('a')).toBe(true);
  });

  it('applies an update and converges encodeState', async () => {
    const rm = new RoomManager(makeSnapshotSvc() as never, { flushDelayMs: 0 });
    const room = await rm.getOrCreate('b2');
    const ext = new Y.Doc();
    ext.getMap('elements').set('z', new Y.Map());
    room.applyUpdate(Y.encodeStateAsUpdate(ext));
    const mirror = new Y.Doc();
    Y.applyUpdate(mirror, room.encodeState());
    expect(mirror.getMap('elements').has('z')).toBe(true);
  });

  it('persists on flushNow', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.getOrCreate('b3');
    const ext = new Y.Doc();
    ext.getMap('elements').set('z', new Y.Map());
    room.applyUpdate(Y.encodeStateAsUpdate(ext));
    await rm.flushNow('b3');
    expect(snap.save).toHaveBeenCalledWith('b3', expect.any(Uint8Array), undefined);
  });

  it('reference-counts clients and reports remaining on remove', async () => {
    const rm = new RoomManager(makeSnapshotSvc() as never, { flushDelayMs: 0 });
    const room = await rm.getOrCreate('b4');
    room.addClient();
    room.addClient();
    expect(room.removeClient()).toBe(1);
    expect(room.removeClient()).toBe(0);
  });
});

describe('RoomManager concurrent cold load', () => {
  it('returns the same room to callers racing on a cold board', async () => {
    let release!: (v: Uint8Array | null) => void;
    const snap = makeSnapshotSvc();
    snap.loadLatest.mockImplementation(() => new Promise((r) => (release = r)));
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const first = rm.getOrCreate('b5');
    const second = rm.getOrCreate('b5');
    release(null);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(snap.loadLatest).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load, so the next caller retries', async () => {
    const snap = makeSnapshotSvc();
    snap.loadLatest.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(null);
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    await expect(rm.getOrCreate('b6')).rejects.toThrow('db down');
    await expect(rm.getOrCreate('b6')).resolves.toMatchObject({ boardId: 'b6' });
  });
});

function edit(key: string): Uint8Array {
  const d = new Y.Doc();
  d.getMap('elements').set(key, new Y.Map());
  return Y.encodeStateAsUpdate(d);
}

describe('RoomManager snapshot hygiene', () => {
  it('skips the save when nothing changed since load', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    await rm.acquire('h1');
    await rm.flushNow('h1');
    expect(snap.save).not.toHaveBeenCalled();
  });

  it('skips the save when nothing changed since the last save', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.acquire('h2');
    room.applyUpdate(edit('a'));
    await rm.flushNow('h2');
    await rm.flushNow('h2');
    expect(snap.save).toHaveBeenCalledTimes(1);
  });

  it('saves a delete-only change (deletes do not move the state vector)', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.acquire('h3');
    room.applyUpdate(edit('a'));
    await rm.flushNow('h3');
    room.ydoc.getMap('elements').delete('a');
    await rm.flushNow('h3');
    expect(snap.save).toHaveBeenCalledTimes(2);
  });

  it('stays dirty when an edit lands while the save is in flight', async () => {
    const snap = makeSnapshotSvc();
    let finish!: () => void;
    snap.save.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.acquire('h4');
    room.applyUpdate(edit('a'));
    const flushing = rm.flushNow('h4');
    room.applyUpdate(edit('b'));
    finish();
    await flushing;
    await rm.flushNow('h4');
    expect(snap.save).toHaveBeenCalledTimes(2);
  });
});

describe('RoomManager lifecycle', () => {
  it('acquire counts the caller as a client', async () => {
    const rm = new RoomManager(makeSnapshotSvc() as never, { flushDelayMs: 0 });
    const room = await rm.acquire('l1');
    expect(room.clients()).toBe(1);
  });

  it('disposes an idle room so the next join reloads fresh state from the DB', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.acquire('l2');
    room.removeClient();
    expect(rm.disposeIfIdle('l2')).toBe(true);
    await rm.acquire('l2');
    expect(snap.loadLatest).toHaveBeenCalledTimes(2);
  });

  it('keeps a room that someone rejoined before the dispose check', async () => {
    const rm = new RoomManager(makeSnapshotSvc() as never, { flushDelayMs: 0 });
    const room = await rm.acquire('l3');
    room.removeClient();
    const again = await rm.acquire('l3');
    expect(rm.disposeIfIdle('l3')).toBe(false);
    expect(again).toBe(room);
  });

  it('getIfActive never creates a room', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    expect(rm.getIfActive('l4')).toBeNull();
    expect(snap.loadLatest).not.toHaveBeenCalled();
  });
});

describe('RoomManager debounced flush', () => {
  afterEach(() => jest.useRealTimers());

  it('logs instead of crashing when the debounced save rejects', async () => {
    jest.useFakeTimers();
    const snap = makeSnapshotSvc();
    snap.save.mockRejectedValueOnce(new Error('db down'));
    const rm = new RoomManager(snap as never, { flushDelayMs: 10 });
    const room = await rm.acquire('d1');
    room.applyUpdate(edit('a'));
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      seen.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      await jest.advanceTimersByTimeAsync(10);
      jest.useRealTimers();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(seen).toEqual([]);
    expect(snap.save).toHaveBeenCalledTimes(1);
  });

  it('saves a board under steady editing within MAX_FLUSH_WAIT_MS, even though the debounce never goes quiet', async () => {
    jest.useFakeTimers();
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 3000 });
    const room = await rm.acquire('d2');
    // An edit every second keeps resetting the 3 s debounce.
    for (let t = 0; t < MAX_FLUSH_WAIT_MS - 1000; t += 1000) {
      room.applyUpdate(edit(`k${t}`));
      await jest.advanceTimersByTimeAsync(1000);
    }
    expect(snap.save).not.toHaveBeenCalled();
    room.applyUpdate(edit('last'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(snap.save).toHaveBeenCalledTimes(1);

    // The clock restarts after a save: the next burst waits for its own debounce or max wait.
    room.applyUpdate(edit('after'));
    await jest.advanceTimersByTimeAsync(2999);
    expect(snap.save).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(snap.save).toHaveBeenCalledTimes(2);
  });

  it('flushAll saves every dirty room and cancels pending timers', async () => {
    jest.useFakeTimers();
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 60_000 });
    (await rm.acquire('f1')).applyUpdate(edit('a'));
    (await rm.acquire('f2')).applyUpdate(edit('b'));
    await rm.acquire('f3'); // clean: must not be saved
    await rm.flushAll();
    expect(snap.save.mock.calls.map((c) => c[0]).sort()).toEqual(['f1', 'f2']);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('RoomManager.releaseIdle', () => {
  it('flushes then disposes the room after the last client left', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.acquire('r1');
    room.applyUpdate(edit('a'));
    room.removeClient();
    await rm.releaseIdle('r1');
    expect(snap.save).toHaveBeenCalledTimes(1);
    expect(rm.getIfActive('r1')).toBeNull();
  });

  it('keeps the room when a client rejoined during the awaited flush', async () => {
    const snap = makeSnapshotSvc();
    let finish!: () => void;
    snap.save.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.acquire('r2');
    room.applyUpdate(edit('a'));
    room.removeClient();
    const releasing = rm.releaseIdle('r2');
    const rejoined = await rm.acquire('r2');
    finish();
    await releasing;
    expect(rejoined).toBe(room);
    expect(rm.getIfActive('r2')).not.toBeNull();
  });

  it('keeps a room whose flush failed so its edits are not thrown away', async () => {
    const snap = makeSnapshotSvc();
    snap.save.mockRejectedValueOnce(new Error('db down'));
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const room = await rm.acquire('r3');
    room.applyUpdate(edit('a'));
    room.removeClient();
    await expect(rm.releaseIdle('r3')).resolves.toBeUndefined();
    expect(rm.getIfActive('r3')).not.toBeNull();
  });
});

function remoteState(key: string): Uint8Array {
  return edit(key);
}

describe('RoomManager seeding from other instances', () => {
  it('applies the seed before any caller sees a freshly loaded room, and only once', async () => {
    const rm = new RoomManager(makeSnapshotSvc() as never, { flushDelayMs: 0 });
    let release!: () => void;
    const seed = jest.fn(
      (room: Room) =>
        new Promise<void>((resolve) => {
          release = () => {
            room.applyUpdate(remoteState('live'));
            resolve();
          };
        }),
    );
    const first = rm.acquire('s1', seed);
    const second = rm.acquire('s1', seed);
    await new Promise((r) => setImmediate(r));
    expect(seed).toHaveBeenCalledTimes(1);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(a.ydoc.getMap('elements').has('live')).toBe(true);
    expect(a.clients()).toBe(2);
  });

  it('does not count seeded state as an unsaved edit of this instance', async () => {
    const snap = makeSnapshotSvc();
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    await rm.acquire('s2', async (room) => room.applyUpdate(remoteState('live')));
    await rm.flushNow('s2');
    expect(snap.save).not.toHaveBeenCalled();
  });

  it('still opens the room when the seed fails', async () => {
    const rm = new RoomManager(makeSnapshotSvc() as never, { flushDelayMs: 0 });
    const room = await rm.acquire('s3', async () => {
      throw new Error('redis down');
    });
    expect(room.clients()).toBe(1);
  });

  it('does not re-seed a room that still has local clients', async () => {
    const rm = new RoomManager(makeSnapshotSvc() as never, { flushDelayMs: 0 });
    const seed = jest.fn(async () => undefined);
    await rm.acquire('s4', seed);
    await rm.acquire('s4', seed);
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it('re-seeds a room kept after its last client left (its subscription lapsed meanwhile)', async () => {
    const snap = makeSnapshotSvc();
    snap.save.mockRejectedValueOnce(new Error('db down'));
    const rm = new RoomManager(snap as never, { flushDelayMs: 0 });
    const seed = jest.fn(async (_room: Room): Promise<void> => undefined);
    const room = await rm.acquire('s5', seed);
    room.applyUpdate(edit('a'));
    room.removeClient();
    await rm.releaseIdle('s5'); // save fails: the room is kept
    expect(rm.getIfActive('s5')).not.toBeNull();

    let release!: () => void;
    seed.mockImplementationOnce(
      (r: Room) =>
        new Promise<void>((resolve) => {
          release = () => {
            r.applyUpdate(remoteState('missed'));
            resolve();
          };
        }),
    );
    const first = rm.acquire('s5', seed);
    const second = rm.acquire('s5', seed);
    await new Promise((r) => setImmediate(r));
    expect(seed).toHaveBeenCalledTimes(2);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(room);
    expect(b).toBe(room);
    expect(room.ydoc.getMap('elements').has('missed')).toBe(true);
    expect(room.clients()).toBe(2);
  });
});
