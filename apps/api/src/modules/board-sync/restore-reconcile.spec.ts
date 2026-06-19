import * as Y from 'yjs';
import { reconcileToSnapshot } from './restore-reconcile';

function elementsOf(doc: Y.Doc): Record<string, Record<string, unknown>> {
  return doc.getMap('elements').toJSON() as Record<string, Record<string, unknown>>;
}

describe('reconcileToSnapshot', () => {
  it('deletes absent elements, sets changed/new ones, and returns the produced update', () => {
    // Live room: {a: {x:1}, b: {x:2}}
    const room = new Y.Doc();
    room.transact(() => {
      const els = room.getMap('elements');
      const a = new Y.Map<unknown>();
      a.set('x', 1);
      els.set('a', a);
      const b = new Y.Map<unknown>();
      b.set('x', 2);
      els.set('b', b);
    });

    // Snapshot: {a: {x:99}, c: {x:3}} — a changed, b removed, c added
    const snap = new Y.Doc();
    snap.transact(() => {
      const els = snap.getMap('elements');
      const a = new Y.Map<unknown>();
      a.set('x', 99);
      els.set('a', a);
      const c = new Y.Map<unknown>();
      c.set('x', 3);
      els.set('c', c);
    });
    const snapshotBytes = Y.encodeStateAsUpdate(snap);

    // Capture a peer's state BEFORE reconcile, then apply the produced update to
    // that peer to prove the forward update carries the deletes + sets that make
    // a live client converge to the snapshot (CRDT convergence, real Y.Doc).
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(room));

    const update = reconcileToSnapshot(room, snapshotBytes);

    expect(update).not.toBeNull();
    expect(elementsOf(room)).toEqual({ a: { x: 99 }, c: { x: 3 } });

    Y.applyUpdate(peer, update!);
    expect(elementsOf(peer)).toEqual({ a: { x: 99 }, c: { x: 3 } });
  });

  it('returns null when the doc already equals the snapshot', () => {
    const room = new Y.Doc();
    room.transact(() => {
      const a = new Y.Map<unknown>();
      a.set('x', 1);
      room.getMap('elements').set('a', a);
    });
    const snap = new Y.Doc();
    snap.transact(() => {
      const a = new Y.Map<unknown>();
      a.set('x', 1);
      snap.getMap('elements').set('a', a);
    });
    const update = reconcileToSnapshot(room, Y.encodeStateAsUpdate(snap));
    expect(update).toBeNull();
  });
});
