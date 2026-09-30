import * as Y from 'yjs';

/**
 * Every top-level map a board doc carries. A restore must roll all of them
 * back, otherwise comments and the shared timer silently survive a restore.
 */
export const RESTORABLE_MAPS = ['elements', 'comments', 'meta'] as const;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Make a nested Y.Map's fields equal `target` field by field, so unchanged fields produce no ops. */
function reconcileFields(inner: Y.Map<unknown>, target: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(target)) {
    if (!sameJson(inner.get(k), v)) inner.set(k, v);
  }
  for (const k of Array.from(inner.keys())) {
    if (!(k in target)) inner.delete(k);
  }
}

function reconcileMap(live: Y.Map<unknown>, target: Y.Map<unknown>): void {
  for (const key of Array.from(live.keys())) {
    if (!target.has(key)) live.delete(key);
  }
  target.forEach((tValue, key) => {
    const current = live.get(key);
    if (tValue instanceof Y.Map) {
      // Elements are nested Y.Maps; keep the live instance where possible so
      // concurrent field edits on other clients still merge into it.
      const fields = tValue.toJSON() as Record<string, unknown>;
      if (current instanceof Y.Map) {
        reconcileFields(current, fields);
      } else {
        const inner = new Y.Map<unknown>();
        live.set(key, inner);
        reconcileFields(inner, fields);
      }
      return;
    }
    const plain = tValue instanceof Y.AbstractType ? tValue.toJSON() : tValue;
    const currentPlain = current instanceof Y.AbstractType ? current.toJSON() : current;
    if (current instanceof Y.AbstractType || !sameJson(currentPlain, plain)) live.set(key, plain);
  });
}

/** Mutate roomYdoc's restorable maps to equal the snapshot's (deletes + sets),
 *  returning the single update the transaction produced (or null if nothing changed). */
export function reconcileToSnapshot(roomYdoc: Y.Doc, snapshotBytes: Uint8Array): Uint8Array | null {
  const tmp = new Y.Doc();
  Y.applyUpdate(tmp, snapshotBytes);
  let captured: Uint8Array | null = null;
  const handler = (u: Uint8Array): void => {
    captured = u;
  };
  roomYdoc.on('update', handler);
  try {
    roomYdoc.transact(() => {
      for (const name of RESTORABLE_MAPS) {
        reconcileMap(roomYdoc.getMap<unknown>(name), tmp.getMap<unknown>(name));
      }
    }, 'restore');
  } finally {
    roomYdoc.off('update', handler);
    tmp.destroy();
  }
  return captured;
}
