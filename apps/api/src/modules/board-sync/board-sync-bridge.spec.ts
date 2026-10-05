import { EventEmitter } from 'node:events';
import {
  BoardSyncBridge,
  channelFor,
  awarenessChannelFor,
  awarenessRequestChannelFor,
  encodeFrame,
  decodeFrame,
  INSTANCE_ID_BYTES,
  stateRequestChannelFor,
  stateReplyChannelFor,
  type StateReply,
  RESYNC_DEBOUNCE_MS,
  claimsChannelFor,
  parseClaimMessage,
  MAX_CLAIM_USER_ID_LENGTH,
} from './board-sync-bridge';

// A fake ioredis client: records subscribe/unsubscribe/publish, emits messageBuffer.
class FakeRedis extends EventEmitter {
  subscribed: string[] = [];
  unsubscribed: string[] = [];
  published: Array<{ channel: string; payload: Buffer }> = [];
  duplicated: FakeRedis[] = [];
  duplicate(): FakeRedis {
    const d = new FakeRedis();
    this.duplicated.push(d);
    return d;
  }
  isCluster = false;
  clusterInfo = '# Cluster\r\ncluster_enabled:0\r\n';
  async subscribe(...channels: string[]): Promise<void> {
    this.subscribed.push(...channels);
  }
  async unsubscribe(channel: string): Promise<void> {
    this.unsubscribed.push(channel);
  }
  publish(channel: string, payload: Buffer): Promise<number> {
    this.published.push({ channel, payload });
    return Promise.resolve(1);
  }
  async info(): Promise<string> {
    return this.clusterInfo;
  }
  async quit(): Promise<void> {}
}

function makeBridge() {
  const pub = new FakeRedis();
  const svc = {
    getClient: () => pub,
  } as unknown as import('../../redis/redis.service').RedisService;
  const bridge = new BoardSyncBridge(svc);
  bridge.onModuleInit();
  const sub = pub.duplicated[0]!; // the subscriber connection
  return { bridge, pub, sub };
}

describe('frame helpers', () => {
  it('round-trips instanceId + update', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const update = new Uint8Array([5, 6, 7, 8]);
    const frame = encodeFrame(id, update);
    expect(frame.length).toBe(INSTANCE_ID_BYTES + 4);
    const out = decodeFrame(frame);
    expect(out.instanceId).toBe(id);
    expect(Array.from(out.update)).toEqual([5, 6, 7, 8]);
  });

  it('maps board id to its updates channel', () => {
    expect(channelFor('b1')).toBe('board:b1:updates');
  });

  it('maps board id to its awareness-request channel', () => {
    expect(awarenessRequestChannelFor('b1')).toBe('board:b1:awareness-request');
  });

  it('maps board id to awareness channel', () => {
    expect(awarenessChannelFor('b1')).toBe('board:b1:awareness');
  });
});

describe('BoardSyncBridge', () => {
  it('publishes a framed message stamped with its own instance id', () => {
    const { bridge, pub } = makeBridge();
    bridge.publish('b1', new Uint8Array([1, 2]));
    expect(pub.published).toHaveLength(1);
    expect(pub.published[0]!.channel).toBe('board:b1:updates');
    expect(decodeFrame(pub.published[0]!.payload).instanceId).toBe(bridge.instanceId);
  });

  it('subscribes once per board (ref-counted) and unsubscribes at zero', async () => {
    const { bridge, sub } = makeBridge();
    bridge.register('b1');
    bridge.register('b1');
    expect(sub.subscribed.filter((c) => c === 'board:b1:updates')).toHaveLength(1);
    bridge.unregister('b1');
    expect(sub.unsubscribed).not.toContain('board:b1:updates');
    bridge.unregister('b1');
    expect(sub.unsubscribed).toContain('board:b1:updates');
  });

  it('lets every registrant await the SUBSCRIBE, so nothing published meanwhile is missed', async () => {
    const { bridge, sub } = makeBridge();
    let confirm!: () => void;
    sub.subscribe = jest.fn(() => new Promise<void>((r) => (confirm = r)));
    let firstDone = false;
    let secondDone = false;
    void bridge.register('b1').then(() => (firstDone = true));
    void bridge.register('b1').then(() => (secondDone = true));
    await new Promise((r) => setImmediate(r));
    expect(firstDone || secondDone).toBe(false);
    confirm();
    await new Promise((r) => setImmediate(r));
    expect(firstDone && secondDone).toBe(true);
  });

  it('settles the registration even when SUBSCRIBE fails (logged, never thrown)', async () => {
    const { bridge, sub } = makeBridge();
    sub.subscribe = jest.fn(async () => {
      throw new Error('Connection is closed.');
    });
    await expect(bridge.register('b1')).resolves.toBeUndefined();
  });

  it('register subscribes to both updates and awareness channels', () => {
    const { bridge, sub } = makeBridge();
    bridge.register('b1');
    expect(sub.subscribed).toContain('board:b1:updates');
    expect(sub.subscribed).toContain('board:b1:awareness');
  });

  it('unregister unsubscribes from both channels at zero', () => {
    const { bridge, sub } = makeBridge();
    bridge.register('b1');
    bridge.unregister('b1');
    expect(sub.unsubscribed).toContain('board:b1:updates');
    expect(sub.unsubscribed).toContain('board:b1:awareness');
  });

  it('register also subscribes to the awareness-request and access channels', () => {
    const { bridge, sub } = makeBridge();
    bridge.register('b1');
    expect(sub.subscribed).toContain('board:b1:awareness-request');
    expect(sub.subscribed).toContain('board:b1:access');
    bridge.unregister('b1');
    expect(sub.unsubscribed).toContain('board:b1:awareness-request');
    expect(sub.unsubscribed).toContain('board:b1:access');
  });

  it('ignores messages on an unrecognised or empty-board channel', () => {
    const { bridge, sub } = makeBridge();
    const got: string[] = [];
    bridge.setUpdateHandler((boardId) => got.push(boardId));
    const frame = encodeFrame('00000000-0000-0000-0000-000000000000', new Uint8Array([1]));
    sub.emit('messageBuffer', Buffer.from('nope'), frame);
    // `.+` requires at least one char, so `board::updates` is not parsed as ''.
    sub.emit('messageBuffer', Buffer.from('board::updates'), frame);
    expect(got).toEqual([]);
  });

  it('publishes an awareness request and routes remote ones, de-duping its own', () => {
    const { bridge, pub, sub } = makeBridge();
    const got: string[] = [];
    bridge.setAwarenessRequestHandler((boardId) => got.push(boardId));
    bridge.publishAwarenessRequest('b1');
    const msg = pub.published.find((p) => p.channel === 'board:b1:awareness-request');
    expect(msg).toBeDefined();
    sub.emit('messageBuffer', Buffer.from('board:b1:awareness-request'), msg!.payload); // own echo
    sub.emit(
      'messageBuffer',
      Buffer.from('board:b1:awareness-request'),
      encodeFrame('00000000-0000-0000-0000-000000000000', new Uint8Array()),
    );
    expect(got).toEqual(['b1']);
  });

  it('hands raw access-channel payloads to the access handler', () => {
    const { bridge, sub } = makeBridge();
    const got: Array<{ boardId: string; payload: string }> = [];
    bridge.setAccessHandler((boardId, payload) =>
      got.push({ boardId, payload: Buffer.from(payload).toString('utf8') }),
    );
    sub.emit('messageBuffer', Buffer.from('board:b1:access'), Buffer.from('{"x":1}'));
    expect(got).toEqual([{ boardId: 'b1', payload: '{"x":1}' }]);
  });

  it('publishes awareness on the awareness channel, stamped with own id', () => {
    const { bridge, pub } = makeBridge();
    bridge.publishAwareness('b1', new Uint8Array([1]));
    const msg = pub.published.find((p) => p.channel === 'board:b1:awareness');
    expect(msg).toBeDefined();
  });

  it('routes awareness-channel messages to the awareness handler and de-dups own', () => {
    const { bridge, sub } = makeBridge();
    const got: number[][] = [];
    bridge.setAwarenessHandler((_bid: string, u: Uint8Array) => got.push(Array.from(u)));
    bridge.register('b1');
    // remote awareness → relayed
    sub.emit(
      'messageBuffer',
      Buffer.from('board:b1:awareness'),
      encodeFrame('00000000-0000-0000-0000-000000000000', new Uint8Array([9])),
    );
    // own awareness → ignored
    sub.emit(
      'messageBuffer',
      Buffer.from('board:b1:awareness'),
      encodeFrame(bridge.instanceId, new Uint8Array([7])),
    );
    expect(got).toEqual([[9]]);
  });

  it('relays a remote message and de-dups its own', () => {
    const { bridge, sub } = makeBridge();
    const got: Array<{ boardId: string; update: number[] }> = [];
    bridge.setUpdateHandler((boardId, update) => got.push({ boardId, update: Array.from(update) }));
    bridge.register('b1');

    // remote instance message → relayed
    const remote = encodeFrame('00000000-0000-0000-0000-000000000000', new Uint8Array([9]));
    sub.emit('messageBuffer', Buffer.from('board:b1:updates'), remote);
    // own message → ignored
    const own = encodeFrame(bridge.instanceId, new Uint8Array([7]));
    sub.emit('messageBuffer', Buffer.from('board:b1:updates'), own);

    expect(got).toEqual([{ boardId: 'b1', update: [9] }]);
  });
});

/**
 * Collects unhandled promise rejections raised while `fn` runs and settles.
 * Node terminates the process on an unhandled rejection (exit 1), so a
 * non-empty result here means the API would crash in production.
 */
async function unhandledRejectionsDuring(fn: () => void): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    fn();
    // Drain microtasks, then give Node a macrotask tick to decide the
    // rejection went unhandled.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return seen;
}

describe('BoardSyncBridge redis command failures', () => {
  // Reproduces the container crash: on shutdown ioredis calls flushQueue(), which
  // rejects every pending command with "Connection is closed.". A subscribe whose
  // promise has no rejection handler then kills the process with exit 1.
  it('survives a subscribe that rejects when the connection closes', async () => {
    const { bridge, sub } = makeBridge();
    sub.subscribe = (): Promise<void> => Promise.reject(new Error('Connection is closed.'));

    const unhandled = await unhandledRejectionsDuring(() => bridge.register('b1'));

    expect(unhandled).toEqual([]);
  });

  it('survives an unsubscribe that rejects when the connection closes', async () => {
    const { bridge, sub } = makeBridge();
    bridge.register('b1');
    sub.unsubscribe = (): Promise<void> => Promise.reject(new Error('Connection is closed.'));

    const unhandled = await unhandledRejectionsDuring(() => bridge.unregister('b1'));

    expect(unhandled).toEqual([]);
  });
});

describe('BoardSyncBridge live-state requests', () => {
  const OTHER = '123e4567-e89b-12d3-a456-426614174000';
  const REQ = '00000000-0000-4000-8000-000000000001';

  it('names the per-board request channel and the per-instance reply channel', () => {
    expect(stateRequestChannelFor('b1')).toBe('board:b1:state-request');
    expect(stateReplyChannelFor(OTHER)).toBe(`instance:${OTHER}:state-reply`);
  });

  it('listens on its own reply channel from boot, and on a board request channel while registered', () => {
    const { bridge, sub } = makeBridge();
    expect(sub.subscribed).toContain(stateReplyChannelFor(bridge.instanceId));
    bridge.register('b1');
    expect(sub.subscribed).toContain('board:b1:state-request');
    bridge.unregister('b1');
    expect(sub.unsubscribed).toContain('board:b1:state-request');
  });

  it('publishes a request and reports how many instances received it', async () => {
    const { bridge, pub } = makeBridge();
    pub.publish = (channel: string, payload: Buffer): Promise<number> => {
      pub.published.push({ channel, payload });
      return Promise.resolve(3);
    };
    await expect(bridge.publishStateRequest('b1', REQ)).resolves.toBe(3);
    const frame = decodeFrame(pub.published[0]!.payload);
    expect(pub.published[0]!.channel).toBe('board:b1:state-request');
    expect(frame.instanceId).toBe(bridge.instanceId);
    expect(Buffer.from(frame.update).toString('utf8')).toBe(REQ);
  });

  it('routes a remote request to the request handler', () => {
    const { bridge, sub } = makeBridge();
    const handler = jest.fn();
    bridge.setStateRequestHandler(handler);
    sub.emit('messageBuffer', Buffer.from('board:b1:state-request'), encodeFrame(OTHER, Buffer.from(REQ)));
    expect(handler).toHaveBeenCalledWith('b1', OTHER, REQ);
  });

  it('answers its own echoed request with an empty reply instead of a Redis round trip', () => {
    const { bridge, sub } = makeBridge();
    const onRequest = jest.fn();
    const replies: StateReply[] = [];
    bridge.setStateRequestHandler(onRequest);
    bridge.setStateReplyHandler((r) => replies.push(r));
    sub.emit('messageBuffer', Buffer.from('board:b1:state-request'), encodeFrame(bridge.instanceId, Buffer.from(REQ)));
    expect(onRequest).not.toHaveBeenCalled();
    expect(replies).toEqual([{ requestId: REQ, instanceId: bridge.instanceId, state: new Uint8Array() }]);
  });

  it('drops a request frame without a valid request id', () => {
    const { bridge, sub } = makeBridge();
    const handler = jest.fn();
    bridge.setStateRequestHandler(handler);
    sub.emit('messageBuffer', Buffer.from('board:b1:state-request'), encodeFrame(OTHER, Buffer.from('nope')));
    expect(handler).not.toHaveBeenCalled();
  });

  it('sends a reply to the requester and routes replies addressed to it', () => {
    const { bridge, pub, sub } = makeBridge();
    bridge.publishStateReply(OTHER, REQ, new Uint8Array([7, 8]));
    expect(pub.published[0]!.channel).toBe(stateReplyChannelFor(OTHER));

    const replies: StateReply[] = [];
    bridge.setStateReplyHandler((r) => replies.push(r));
    const incoming = encodeFrame(OTHER, Buffer.concat([Buffer.from(REQ), Buffer.from([7, 8])]));
    sub.emit('messageBuffer', Buffer.from(stateReplyChannelFor(bridge.instanceId)), incoming);
    expect(replies).toEqual([{ requestId: REQ, instanceId: OTHER, state: new Uint8Array([7, 8]) }]);
  });

  it('drops a truncated reply frame', () => {
    const { bridge, sub } = makeBridge();
    const handler = jest.fn();
    bridge.setStateReplyHandler(handler);
    sub.emit('messageBuffer', Buffer.from(stateReplyChannelFor(bridge.instanceId)), Buffer.from('short'));
    sub.emit(
      'messageBuffer',
      Buffer.from(stateReplyChannelFor(bridge.instanceId)),
      encodeFrame(OTHER, Buffer.from('not-a-uuid-at-all-not-a-uuid-at-all')),
    );
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('BoardSyncBridge recovery after a Redis outage', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Drop a connection the way ioredis reports it, then bring it back. */
  function bounce(client: FakeRedis): void {
    client.emit('close');
    client.emit('reconnecting', 200);
    client.emit('ready');
  }

  it('re-subscribes every live board and asks for a resync when the subscriber reconnects', async () => {
    const { bridge, sub } = makeBridge();
    const resync = jest.fn();
    bridge.setResyncHandler(resync);
    bridge.register('b1');
    bridge.register('b2');
    bridge.unregister('b2');
    sub.subscribed = [];

    bounce(sub);
    await jest.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);

    expect(sub.subscribed).toEqual(
      expect.arrayContaining([stateReplyChannelFor(bridge.instanceId), 'board:b1:updates', 'board:b1:state-request']),
    );
    expect(sub.subscribed).not.toContain('board:b2:updates');
    expect(resync).toHaveBeenCalledTimes(1);
    expect(resync).toHaveBeenCalledWith(['b1']);
  });

  it('does not resync on the first ready (boot), only after a disconnect', async () => {
    const { bridge, sub, pub } = makeBridge();
    const resync = jest.fn();
    bridge.setResyncHandler(resync);
    bridge.register('b1');
    sub.emit('ready');
    pub.emit('ready');
    await jest.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS * 2);
    expect(resync).not.toHaveBeenCalled();
  });

  it('resyncs when only the publisher connection reconnects (its publishes were lost)', async () => {
    const { bridge, pub } = makeBridge();
    const resync = jest.fn();
    bridge.setResyncHandler(resync);
    bridge.register('b1');
    bounce(pub);
    await jest.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(resync).toHaveBeenCalledWith(['b1']);
  });

  it('coalesces both connections returning from one outage into a single resync', async () => {
    const { bridge, pub, sub } = makeBridge();
    const resync = jest.fn();
    bridge.setResyncHandler(resync);
    bridge.register('b1');
    pub.emit('close');
    sub.emit('close');
    pub.emit('ready');
    await jest.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    // The subscriber is still down: a resync now could not hear any replies.
    expect(resync).not.toHaveBeenCalled();
    sub.emit('ready');
    await jest.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it('skips the resync (and waits for the next ready) when re-subscribing fails', async () => {
    const { bridge, sub } = makeBridge();
    const resync = jest.fn();
    bridge.setResyncHandler(resync);
    bridge.register('b1');
    sub.subscribe = (): Promise<void> => Promise.reject(new Error('Connection is closed.'));
    bounce(sub);
    await jest.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(resync).not.toHaveBeenCalled();
  });

  it('does not resync when no board is live here', async () => {
    const { bridge, sub } = makeBridge();
    const resync = jest.fn();
    bridge.setResyncHandler(resync);
    bounce(sub);
    await jest.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(resync).not.toHaveBeenCalled();
  });

  it('swallows (and logs) publishes that fail while Redis is down', async () => {
    jest.useRealTimers();
    const { bridge, pub } = makeBridge();
    pub.publish = (): Promise<number> => Promise.reject(new Error('Connection is closed.'));
    const unhandled = await unhandledRejectionsDuring(() => {
      bridge.publish('b1', new Uint8Array([1]));
      bridge.publishAwareness('b1', new Uint8Array([1]));
      bridge.publishAwarenessRequest('b1');
      bridge.publishStateReply('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', new Uint8Array());
    });
    expect(unhandled).toEqual([]);
  });
});

describe('BoardSyncBridge Redis Cluster detection', () => {
  const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

  it('trusts PUBLISH receiver counts on a standalone Redis', async () => {
    const { bridge } = makeBridge();
    await flush();
    expect(bridge.publishCountIsNodeLocal).toBe(false);
  });

  it('flags receiver counts as node-local when the server runs in cluster mode', async () => {
    const pub = new FakeRedis();
    pub.clusterInfo = '# Cluster\r\ncluster_enabled:1\r\n';
    const bridge = new BoardSyncBridge({ getClient: () => pub } as unknown as import('../../redis/redis.service').RedisService);
    bridge.onModuleInit();
    await flush();
    expect(bridge.publishCountIsNodeLocal).toBe(true);
  });

  it('flags receiver counts as node-local for an ioredis Cluster client', () => {
    const pub = new FakeRedis();
    pub.isCluster = true;
    const bridge = new BoardSyncBridge({ getClient: () => pub } as unknown as import('../../redis/redis.service').RedisService);
    bridge.onModuleInit();
    expect(bridge.publishCountIsNodeLocal).toBe(true);
  });
});

describe('BoardSyncBridge awareness claims', () => {
  const OTHER = '123e4567-e89b-12d3-a456-426614174000';
  const frameFrom = (instanceId: string, msg: unknown): Buffer =>
    encodeFrame(instanceId, Buffer.from(JSON.stringify(msg), 'utf8'));
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));
  };

  it('names the per-board claims channel and subscribes to it while the board is live', () => {
    expect(claimsChannelFor('b1')).toBe('board:b1:awareness-claims');
    const { bridge, sub } = makeBridge();
    bridge.register('b1');
    expect(sub.subscribed).toContain('board:b1:awareness-claims');
    bridge.unregister('b1');
    expect(sub.unsubscribed).toContain('board:b1:awareness-claims');
  });

  it('publishes claim messages stamped with its instance id', () => {
    const { bridge, pub } = makeBridge();
    bridge.publishClaims('b1', { op: 'claim', claims: [{ clientId: 42, userId: 'u1' }] });
    const msg = pub.published.find((p) => p.channel === 'board:b1:awareness-claims')!;
    const { instanceId, update } = decodeFrame(msg.payload);
    expect(instanceId).toBe(bridge.instanceId);
    expect(parseClaimMessage(update)).toEqual({ op: 'claim', claims: [{ clientId: 42, userId: 'u1' }] });
  });

  it('routes valid remote claim messages and ignores its own', () => {
    const { bridge, sub } = makeBridge();
    const got: unknown[] = [];
    bridge.setClaimHandler((boardId, instanceId, msg) => got.push({ boardId, instanceId, msg }));
    sub.emit('messageBuffer', Buffer.from('board:b1:awareness-claims'), frameFrom(OTHER, { op: 'release', clientIds: [7] }));
    sub.emit('messageBuffer', Buffer.from('board:b1:awareness-claims'), frameFrom(bridge.instanceId, { op: 'refresh' }));
    expect(got).toEqual([{ boardId: 'b1', instanceId: OTHER, msg: { op: 'release', clientIds: [7] } }]);
  });

  it('drops malformed claim frames without calling the handler', () => {
    const { bridge, sub } = makeBridge();
    const handler = jest.fn();
    bridge.setClaimHandler(handler);
    const bad: unknown[] = [
      { op: 'claim', claims: [{ clientId: -1, userId: 'u1' }] },
      { op: 'claim', claims: [{ clientId: 1.5, userId: 'u1' }] },
      { op: 'claim', claims: [{ clientId: 2 ** 32, userId: 'u1' }] },
      { op: 'claim', claims: [{ clientId: 1, userId: '' }] },
      { op: 'claim', claims: [{ clientId: 1, userId: 'x'.repeat(MAX_CLAIM_USER_ID_LENGTH + 1) }] },
      { op: 'claim', claims: 'nope' },
      { op: 'release', clientIds: ['1'] },
      { op: 'steal' },
      [],
    ];
    for (const msg of bad) sub.emit('messageBuffer', Buffer.from('board:b1:awareness-claims'), frameFrom(OTHER, msg));
    sub.emit('messageBuffer', Buffer.from('board:b1:awareness-claims'), Buffer.from('not-a-frame'));
    sub.emit('messageBuffer', Buffer.from('board:b1:awareness-claims'), encodeFrame(OTHER, Buffer.from('{')));
    expect(handler).not.toHaveBeenCalled();
  });

  it('asks other instances to re-announce their claims once a newly live board is subscribed', async () => {
    const { bridge, pub } = makeBridge();
    bridge.register('b1');
    await flush();
    bridge.register('b1'); // second local socket: no new request
    await flush();
    const refreshes = pub.published.filter((p) => p.channel === 'board:b1:awareness-claims');
    expect(refreshes).toHaveLength(1);
    expect(parseClaimMessage(decodeFrame(refreshes[0]!.payload).update)).toEqual({ op: 'refresh' });
  });
});
