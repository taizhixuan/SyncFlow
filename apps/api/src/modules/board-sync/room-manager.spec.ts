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
