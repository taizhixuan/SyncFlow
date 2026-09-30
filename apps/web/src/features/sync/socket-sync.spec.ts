import { afterEach, describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { SYNC_EVENTS } from '@syncflow/shared';
import { BoardSyncProvider, type SocketAuth, type SocketLike } from './socket-sync';

function fakeSocket() {
  const handlers: Record<string, (arg: unknown) => void> = {};
  const emitted: Array<{ ev: string; arg: unknown }> = [];
  const log: string[] = [];
  const sock: SocketLike & {
    fire(ev: string, arg?: unknown): void;
    emitted: typeof emitted;
    log: string[];
    connects: number;
  } = {
    connected: false,
    connects: 0,
    on(ev, cb) { handlers[ev] = cb as (a: unknown) => void; return sock; },
    emit(ev, arg) { emitted.push({ ev, arg }); log.push(`emit:${ev}`); return sock; },
    connect() { sock.connects += 1; return sock; },
    disconnect() { sock.connected = false; log.push('disconnect'); return sock; },
    fire(ev, arg) { handlers[ev]?.(arg); },
    emitted,
    log,
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
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc,
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
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc,
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

describe('BoardSyncProvider awareness', () => {
  it('emits an awareness update when local state changes', () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    const before = sock.emitted.length;
    awareness.setLocalStateField('cursor', { x: 1, y: 2 });
    const sent = sock.emitted.slice(before).filter((e) => e.ev === SYNC_EVENTS.awareness);
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it('emits its full awareness on connect so already-present peers see it', () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    // State set BEFORE connect (as the app does) must still reach peers on join.
    awareness.setLocalStateField('user', { id: 'u1', name: 'Ada', color: '#0f0' });
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    expect(sock.emitted.some((e) => e.ev === SYNC_EVENTS.awareness)).toBe(true);
  });

  it('stamps the local user identity onto awareness on connect (survives a cleared state)', () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    // No 'user' set locally beforehand — the provider must stamp it on connect
    // so a teardown that cleared identity (or a pre-auth connect) can't leave us
    // invisible to peers.
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      user: { id: 'u9', name: 'Cleo', color: '#abc' },
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    expect(awareness.getLocalState()?.user).toEqual({ id: 'u9', name: 'Cleo', color: '#abc' });
    expect(sock.emitted.some((e) => e.ev === SYNC_EVENTS.awareness)).toBe(true);
  });

  it('re-stamps identity after a prior teardown nulled local state (StrictMode remount)', () => {
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    // A previous provider's destroy() removes our local state, leaving it null —
    // which makes y-protocols setLocalStateField a silent no-op thereafter.
    removeAwarenessStates(awareness, [awareness.clientID], 'local');
    expect(awareness.getLocalState()).toBeNull();

    const sock = fakeSocket();
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      user: { id: 'u1', name: 'Ada', color: '#0f0' },
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    // The provider must re-arm and publish identity despite the null start.
    expect(awareness.getLocalState()?.user).toEqual({ id: 'u1', name: 'Ada', color: '#0f0' });
  });

  it('re-broadcasts its full awareness when the server requests it (new peer joined)', () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    awareness.setLocalStateField('user', { id: 'u1', name: 'Ada', color: '#0f0' });
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    const before = sock.emitted.length;
    sock.fire(SYNC_EVENTS.awarenessRequest);
    const sent = sock.emitted.slice(before).filter((e) => e.ev === SYNC_EVENTS.awareness);
    expect(sent.length).toBe(1);
  });

  it('applies an inbound awareness update into the awareness instance', () => {
    // a second client encodes its state; our provider applies it
    const otherDoc = new Y.Doc();
    const other = new Awareness(otherDoc);
    other.setLocalStateField('user', { id: 'u2', name: 'Bob', color: '#f00' });
    const bytes = encodeAwarenessUpdate(other, [other.clientID]);

    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    sock.fire(SYNC_EVENTS.awareness, bytes);
    const states = awareness.getStates();
    expect(states.get(other.clientID)?.user?.name).toBe('Bob');
  });
});

describe('BoardSyncProvider lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup(overrides: Partial<ConstructorParameters<typeof BoardSyncProvider>[0]> = {}) {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    const statuses: string[] = [];
    const rejections: string[] = [];
    let auth: SocketAuth | null = null;
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      applyRemote: () => {},
      onStatus: (s) => statuses.push(s),
      onRejected: (r) => rejections.push(r),
      socketFactory: (_url, a) => { auth = a; return sock; },
      ...overrides,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    return { sock, awareness, statuses, rejections, p, auth: () => auth! };
  }

  it('sends the awareness removal BEFORE unsubscribing and disconnecting (no ghost cursor)', () => {
    const { sock, awareness, p } = setup();
    awareness.setLocalStateField('user', { id: 'u1', name: 'Ada', color: '#0f0' });
    sock.log.length = 0;
    p.destroy();
    const lastAwareness = sock.log.lastIndexOf(`emit:${SYNC_EVENTS.awareness}`);
    expect(lastAwareness).toBeGreaterThanOrEqual(0);
    expect(lastAwareness).toBeLessThan(sock.log.indexOf('disconnect'));
  });

  it('reads the latest token on every (re)connect handshake', () => {
    let token = 'first';
    const { auth } = setup({ getToken: () => token });
    token = 'rotated';
    const seen: unknown[] = [];
    auth()((data) => seen.push(data));
    expect(seen).toEqual([{ token: 'rotated' }]);
  });

  it.each(['forbidden', 'not-found'] as const)(
    'treats a %s rejection as terminal: no "reconnecting" forever, no reconnect',
    (code) => {
      const { sock, statuses, rejections } = setup();
      sock.fire(SYNC_EVENTS.error, { code, message: 'no' });
      sock.fire('disconnect', 'io server disconnect');
      expect(rejections).toEqual([code]);
      expect(statuses.at(-1)).toBe('offline');
      expect(sock.connects).toBe(0);
    },
  );

  it('refreshes the access token and reconnects on an unauthorized rejection', async () => {
    const refreshToken = vi.fn().mockResolvedValue('fresh');
    const { sock, statuses, rejections } = setup({ refreshToken });
    sock.fire(SYNC_EVENTS.error, { code: 'unauthorized', message: 'Invalid token' });
    sock.fire('disconnect', 'io server disconnect');
    expect(statuses.at(-1)).toBe('connecting');
    await vi.waitFor(() => expect(sock.connects).toBe(1));
    expect(refreshToken).toHaveBeenCalledOnce();
    expect(rejections).toEqual([]);
  });

  it('gives up with an unauthorized rejection when the session cannot be refreshed', async () => {
    const refreshToken = vi.fn().mockResolvedValue(null);
    const { sock, statuses, rejections } = setup({ refreshToken });
    sock.fire(SYNC_EVENTS.error, { code: 'unauthorized', message: 'Invalid token' });
    sock.fire('disconnect', 'io server disconnect');
    await vi.waitFor(() => expect(rejections).toEqual(['unauthorized']));
    expect(statuses.at(-1)).toBe('offline');
    expect(sock.connects).toBe(0);
  });

  it('stops retrying after repeated unauthorized rejections despite refreshes', async () => {
    const refreshToken = vi.fn().mockResolvedValue('fresh');
    const { sock, rejections } = setup({ refreshToken });
    for (let i = 0; i < 3; i++) {
      sock.fire(SYNC_EVENTS.error, { code: 'unauthorized', message: 'Invalid token' });
      sock.fire('disconnect', 'io server disconnect');
      await Promise.resolve();
      await Promise.resolve();
    }
    await vi.waitFor(() => expect(rejections).toEqual(['unauthorized']));
  });

  it('reconnects manually after a bare server-initiated disconnect', () => {
    vi.useFakeTimers();
    const { sock, statuses } = setup();
    sock.fire('disconnect', 'io server disconnect');
    expect(statuses.at(-1)).toBe('connecting');
    vi.advanceTimersByTime(5000);
    expect(sock.connects).toBe(1);
  });

  it('reports offline (not reconnecting) after a client-initiated disconnect', () => {
    const { sock, statuses } = setup();
    sock.fire('disconnect', 'io client disconnect');
    expect(statuses.at(-1)).toBe('offline');
  });

  it('drops and logs a malformed error payload instead of changing state', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sock, statuses, rejections } = setup();
    const before = statuses.length;
    sock.fire(SYNC_EVENTS.error, { code: 'teapot' });
    expect(warn).toHaveBeenCalled();
    expect(rejections).toEqual([]);
    expect(statuses.length).toBe(before);
  });
});
