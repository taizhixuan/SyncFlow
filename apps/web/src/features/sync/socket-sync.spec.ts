import { afterEach, describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
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

function varUint(n: number): number[] {
  const out: number[] = [];
  let rest = n;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
  return out;
}

/** The y-protocols wire bytes of a null (removed) state for `clientId` at `clock`, as the server sends it. */
function awarenessRemoval(clientId: number, clock: number): Uint8Array {
  const nul = [...new TextEncoder().encode('null')];
  return new Uint8Array([...varUint(1), ...varUint(clientId), ...varUint(clock), ...varUint(nul.length), ...nul]);
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

  it('reports a live role change, and ignores a malformed one', () => {
    const sock = fakeSocket();
    const roles: string[] = [];
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc: new Y.Doc(),
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
      onRoleChanged: (r) => roles.push(r),
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    sock.fire(SYNC_EVENTS.role, { role: 'viewer' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sock.fire(SYNC_EVENTS.role, { role: 'admin' });
    warn.mockRestore();
    expect(roles).toEqual(['viewer']);
  });

  it('re-sends its full doc once promoted from viewer, so edits the server dropped meanwhile get through', () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc,
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
      onRoleChanged: () => undefined,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    sock.fire(SYNC_EVENTS.role, { role: 'viewer' });
    ydoc.getMap('elements').set('dropped-while-viewer', 1); // the server drops this update
    const syncsBefore = sock.emitted.filter((e) => e.ev === SYNC_EVENTS.clientSync).length;

    sock.fire(SYNC_EVENTS.role, { role: 'editor' });

    const syncs = sock.emitted.filter((e) => e.ev === SYNC_EVENTS.clientSync);
    expect(syncs).toHaveLength(syncsBefore + 1);
    const server = new Y.Doc();
    Y.applyUpdate(server, syncs.at(-1)!.arg as Uint8Array);
    expect(server.getMap('elements').get('dropped-while-viewer')).toBe(1);
  });

  it('does not re-send its doc for the role the server confirms on every connect', () => {
    const sock = fakeSocket();
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc: new Y.Doc(),
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
      onRoleChanged: () => undefined,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    sock.fire(SYNC_EVENTS.role, { role: 'editor' });
    sock.fire('connect');
    sock.fire(SYNC_EVENTS.role, { role: 'editor' });
    expect(sock.emitted.filter((e) => e.ev === SYNC_EVENTS.clientSync)).toHaveLength(2); // one per connect
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

  it("is shown to peers again right after a server kick: the server's removal does not outrank our reconnect", () => {
    const sock = fakeSocket();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc, awareness,
      user: { id: 'u1', name: 'Ada', color: '#0f0' },
      applyRemote: () => {}, onStatus: () => {}, socketFactory: () => sock,
    });
    const peer = new Awareness(new Y.Doc());
    const deliver = (from: number): void => {
      for (const e of sock.emitted.slice(from)) {
        if (e.ev === SYNC_EVENTS.awareness) applyAwarenessUpdate(peer, e.arg as Uint8Array, 'remote');
      }
    };
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    deliver(0);
    expect(peer.getStates().get(awareness.clientID)?.user?.name).toBe('Ada');

    // The token-expiry kick: the server broadcasts our removal at the last clock we announced.
    const lastClock = awareness.meta.get(awareness.clientID)!.clock;
    applyAwarenessUpdate(peer, awarenessRemoval(awareness.clientID, lastClock), 'remote');
    expect(peer.getStates().has(awareness.clientID)).toBe(false);

    // An idle user reconnects without touching the mouse.
    const before = sock.emitted.length;
    sock.fire('disconnect', 'io server disconnect');
    sock.fire('connect');
    deliver(before);
    expect(peer.getStates().get(awareness.clientID)?.user?.name).toBe('Ada');
    p.destroy();
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

  // socket.io only notices a dead network at its ping timeout (~25s); the
  // browser knows at once, so the badge and the reconnect should follow it.
  it('reports offline as soon as the browser loses the network', () => {
    const { statuses } = setup();
    window.dispatchEvent(new Event('offline'));
    expect(statuses.at(-1)).toBe('offline');
  });

  it('reconnects immediately when the browser comes back online', () => {
    const { sock } = setup();
    sock.connected = false;
    window.dispatchEvent(new Event('online'));
    expect(sock.connects).toBe(1);
  });

  it('stops following network events after destroy', () => {
    const { sock, statuses, p } = setup();
    p.destroy();
    const before = statuses.length;
    sock.connected = false;
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('offline'));
    expect(statuses.length).toBe(before);
    expect(sock.connects).toBe(0);
  });

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

  it('backs off at the longest delay after a rate-limit kick, without giving up', () => {
    vi.useFakeTimers();
    try {
      const { sock, statuses, rejections } = setup();
      sock.fire(SYNC_EVENTS.error, { code: 'rate-limited', message: 'Too many messages' });
      sock.fire('disconnect', 'io server disconnect');
      expect(rejections).toEqual([]);
      expect(statuses.at(-1)).toBe('connecting');
      vi.advanceTimersByTime(4999);
      expect(sock.connects).toBe(0);
      vi.advanceTimersByTime(1);
      expect(sock.connects).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

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

describe('BoardSyncProvider clock offset', () => {
  // The event is spelled out (not read from SYNC_EVENTS) so the spec pins the wire contract.
  const CLOCK_EVENT = 'board:clock';
  type Ack = (payload: unknown) => void;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const sock = fakeSocket();
    const offsets: number[] = [];
    const p = new BoardSyncProvider({
      url: 'x', boardId: 'b1', getToken: () => 't', ydoc: new Y.Doc(),
      applyRemote: () => {}, onStatus: () => {},
      onClockOffset: (ms) => offsets.push(ms),
      socketFactory: () => sock,
    });
    p.connect();
    sock.connected = true;
    sock.fire('connect');
    const pings = (): Ack[] => sock.emitted.filter((e) => e.ev === CLOCK_EVENT).map((e) => e.arg as Ack);
    /** Answer the latest ping `rttMs` after it was sent, with the server clock at `serverNow`. */
    const answer = (rttMs: number, serverNow: unknown): void => {
      vi.setSystemTime(Date.now() + rttMs);
      pings().at(-1)!({ serverNow });
    };
    return { sock, p, offsets, pings, answer };
  }

  it('pings the server clock after connect and keeps the sample with the smallest round trip', () => {
    const { pings, answer, offsets } = setup();
    expect(pings()).toHaveLength(1); // one at a time: a burst would skew the round trips
    answer(100, 5_050); // midpoint 1_050 → offset 4_000
    expect(pings()).toHaveLength(2);
    answer(20, 6_110); // midpoint 1_110 → offset 5_000, tightest round trip
    answer(60, 9_000); // midpoint 1_150 → offset 7_850
    expect(pings()).toHaveLength(3);
    expect(offsets).toEqual([5_000]);
  });

  it('drops and logs a malformed ack and still uses the valid samples', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { answer, offsets } = setup();
    answer(10, 'noon');
    answer(40, 2_000_000);
    answer(10, null);
    expect(warn).toHaveBeenCalled();
    expect(offsets).toEqual([2_000_000 - (1_010 + 1_050) / 2]);
  });

  it('reports nothing when every ack is malformed (the store keeps local time)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { answer, offsets } = setup();
    answer(10, -1);
    answer(10, 'x');
    answer(10, undefined);
    expect(offsets).toEqual([]);
  });

  it('moves on after a timed-out ping and ignores its late ack', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pings, answer, offsets } = setup();
    const first = pings()[0]!;
    vi.advanceTimersByTime(3_000);
    expect(pings()).toHaveLength(2);
    first({ serverNow: 999_999_999 }); // too late to be trusted
    expect(pings()).toHaveLength(2);
    answer(10, 20_000);
    answer(30, 30_000);
    expect(offsets).toEqual([20_000 - (4_000 + 4_010) / 2]);
  });

  it('measures again after a reconnect and ignores acks from the previous connection', () => {
    const { sock, pings, answer, offsets } = setup();
    const stale = pings()[0]!;
    sock.fire('disconnect', 'transport close');
    sock.fire('connect');
    stale({ serverNow: 999_999_999 });
    answer(10, 3_000);
    answer(10, 3_010);
    answer(10, 3_020);
    expect(offsets).toEqual([3_000 - (1_000 + 1_010) / 2]);
  });

  it('reports nothing once destroyed', () => {
    const { p, pings, offsets } = setup();
    const pending = pings()[0]!;
    p.destroy();
    pending({ serverNow: 5_000 });
    vi.advanceTimersByTime(10_000);
    expect(offsets).toEqual([]);
  });
});
