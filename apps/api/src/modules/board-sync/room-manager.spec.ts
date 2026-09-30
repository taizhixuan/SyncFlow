import * as Y from 'yjs';
import { RoomManager } from './room-manager';

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
