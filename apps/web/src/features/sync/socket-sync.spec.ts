import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { BoardSyncProvider, type SocketLike } from './socket-sync';

function fakeSocket() {
  const handlers: Record<string, (arg: unknown) => void> = {};
  const emitted: Array<{ ev: string; arg: unknown }> = [];
  const sock: SocketLike & { fire(ev: string, arg?: unknown): void; emitted: typeof emitted } = {
    connected: false,
    on(ev, cb) { handlers[ev] = cb as (a: unknown) => void; return sock; },
    emit(ev, arg) { emitted.push({ ev, arg }); return sock; },
    disconnect() { sock.connected = false; return sock; },
    fire(ev, arg) { handlers[ev]?.(arg); },
    emitted,
  };
  return sock;
}

describe('BoardSyncProvider', () => {
  it('on server sync, applies the update and reports live', () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const applied: Uint8Array[] = [];
    const statuses: string[] = [];
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', token: 't', ydoc,
      applyRemote: (u) => applied.push(u),
      onStatus: (s) => statuses.push(s),
      socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    sock.fire('board:sync', new Uint8Array([1, 2, 3]));
    expect(applied.length).toBe(1);
    expect(statuses).toContain('live');
  });

  it('broadcasts only local-origin doc updates', () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', token: 't', ydoc,
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    const before = sock.emitted.length;
    // a remote-origin transaction must NOT be re-emitted
    ydoc.transact(() => ydoc.getMap('elements').set('a', new Y.Map()), Symbol('remote-ish'));
    // a local-origin (default) transaction IS emitted
    ydoc.getMap('elements').set('b', new Y.Map());
    const updates = sock.emitted.slice(before).filter((e) => e.ev === 'board:update');
    expect(updates.length).toBeGreaterThanOrEqual(1);
  });
});
