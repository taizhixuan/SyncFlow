import * as Y from 'yjs';

/** Mutate roomYdoc's `elements` to equal the snapshot's elements (deletes + sets),
 *  returning the single update the transaction produced (or null if nothing changed). */
export function reconcileToSnapshot(roomYdoc: Y.Doc, snapshotBytes: Uint8Array): Uint8Array | null {
  const tmp = new Y.Doc();
  Y.applyUpdate(tmp, snapshotBytes);
  const target = tmp.getMap('elements'); // Y.Map<Y.Map<unknown>>
  const live = roomYdoc.getMap('elements') as Y.Map<Y.Map<unknown>>;
  let captured: Uint8Array | null = null;
  const handler = (u: Uint8Array): void => {
    captured = u;
  };
  roomYdoc.on('update', handler);
  roomYdoc.transact(() => {
    for (const id of Array.from(live.keys())) {
      if (!target.has(id)) live.delete(id); // drop elements absent from snapshot
    }
    target.forEach((tEl, id) => {
      const obj = (tEl as Y.Map<unknown>).toJSON() as Record<string, unknown>;
      let inner = live.get(id);
      if (!inner) {
        inner = new Y.Map<unknown>();
        live.set(id, inner);
      }
      for (const [k, v] of Object.entries(obj)) {
        if (JSON.stringify(inner.get(k)) !== JSON.stringify(v)) inner.set(k, v);
      }
      for (const k of Array.from(inner.keys())) {
        if (!(k in obj)) inner.delete(k);
      }
    });
  }, 'restore');
  roomYdoc.off('update', handler);
  return captured;
}
