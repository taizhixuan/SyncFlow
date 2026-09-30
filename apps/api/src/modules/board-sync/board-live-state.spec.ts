import { EventEmitter } from 'node:events';
import * as Y from 'yjs';
import { BoardLiveStatePort } from '../../boards/board-live-state-port';
import type { RedisService } from '../../redis/redis.service';
import { BoardLiveState } from './board-live-state';
import { BoardSyncBridge, decodeFrame, encodeFrame, stateReplyChannelFor } from './board-sync-bridge';
import type { RoomManager } from './room-manager';
import type { SnapshotService } from './snapshot.service';

const OTHER = '123e4567-e89b-12d3-a456-426614174000';
const THIRD = '223e4567-e89b-12d3-a456-426614174000';

/** A fake ioredis client whose PUBLISH reports a configurable receiver count. */
class FakeRedis extends EventEmitter {
  receivers = 0;
  isCluster = false;
  clusterEnabled = false;
  onPublish: (channel: string, payload: Buffer) => void = () => undefined;
  readonly published: Array<{ channel: string; payload: Buffer }> = [];
  sub: FakeRedis | null = null;
  duplicate(): FakeRedis {
    this.sub = new FakeRedis();
    return this.sub;
  }
  async subscribe(): Promise<void> {}
  async unsubscribe(): Promise<void> {}
  publish(channel: string, payload: Buffer): Promise<number> {
    this.published.push({ channel, payload });
    this.onPublish(channel, payload);
    return Promise.resolve(this.receivers);
  }
  async info(): Promise<string> {
    return `# Cluster\r\ncluster_enabled:${this.clusterEnabled ? 1 : 0}\r\n`;
  }
  async quit(): Promise<void> {}
}

function docWith(ids: string[], base?: Uint8Array): Uint8Array {
  const doc = new Y.Doc();
  if (base) Y.applyUpdate(doc, base);
  for (const id of ids) doc.getMap('elements').set(id, id);
  return Y.encodeStateAsUpdate(doc);
}

function ids(state: Uint8Array | null): string[] {
  if (!state) return [];
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return Object.keys(doc.getMap('elements').toJSON()).sort();
}

function setup(opts: { snapshot?: Uint8Array | null; room?: Uint8Array | null; cluster?: boolean } = {}) {
  const pub = new FakeRedis();
  pub.clusterEnabled = opts.cluster ?? false;
  const bridge = new BoardSyncBridge({ getClient: () => pub } as unknown as RedisService);
  bridge.onModuleInit();
  const sub = pub.sub!;
  const roomState = opts.room ?? null;
  const rooms = {
    getIfActive: jest.fn(() =>
      roomState ? Promise.resolve({ encodeState: () => roomState }) : null,
    ),
  };
  const snapshots = { loadLatest: jest.fn(async () => opts.snapshot ?? null) };
  const port = new BoardLiveStatePort();
  const live = new BoardLiveState(
    rooms as unknown as RoomManager,
    snapshots as unknown as SnapshotService,
    bridge,
    port,
  );
  live.onModuleInit();

  /** Deliver a reply frame to the requester, as another instance would. */
  const replyFrom = (instanceId: string, requestId: string, state: Uint8Array): void => {
    const frame = encodeFrame(instanceId, Buffer.concat([Buffer.from(requestId), Buffer.from(state)]));
    sub.emit('messageBuffer', Buffer.from(stateReplyChannelFor(bridge.instanceId)), frame);
  };
  /** The request id of the last state request this instance published. */
  const requestIdOf = (payload: Buffer): string =>
    Buffer.from(decodeFrame(payload).update).toString('utf8');
  return { live, pub, sub, bridge, rooms, snapshots, port, replyFrom, requestIdOf };
}

describe('BoardLiveState.collect', () => {
  it('returns null for a board with no snapshot and no live room anywhere', async () => {
    const { live } = setup();
    await expect(live.collect('b1')).resolves.toBeNull();
  });

  it('merges the latest snapshot with the local live room, without waiting when nobody else holds it', async () => {
    const snapshot = docWith(['saved']);
    const { live } = setup({ snapshot, room: docWith(['unsaved'], snapshot) });
    const started = Date.now();
    const state = await live.collect('b1', 5000);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ids(state)).toEqual(['saved', 'unsaved']);
  });

  it('merges a state another instance replies with', async () => {
    const snapshot = docWith(['saved']);
    const ctx = setup({ snapshot });
    ctx.pub.receivers = 1;
    ctx.pub.onPublish = (channel, payload) => {
      if (channel !== 'board:b1:state-request') return;
      const requestId = ctx.requestIdOf(payload);
      setTimeout(() => ctx.replyFrom(OTHER, requestId, docWith(['remote'], snapshot)), 10);
    };
    const state = await ctx.live.collect('b1', 5000);
    expect(ids(state)).toEqual(['remote', 'saved']);
  });

  it('drops a reply whose state is not a valid Yjs update', async () => {
    const ctx = setup({ snapshot: docWith(['saved']) });
    ctx.pub.receivers = 1;
    ctx.pub.onPublish = (channel, payload) => {
      if (channel !== 'board:b1:state-request') return;
      const requestId = ctx.requestIdOf(payload);
      setTimeout(() => ctx.replyFrom(OTHER, requestId, new Uint8Array([255, 255, 255, 255])), 10);
    };
    const warn = jest.spyOn((ctx.live as unknown as { logger: { warn: () => void } }).logger, 'warn');
    const started = Date.now();
    const state = await ctx.live.collect('b1', 5000);
    // The malformed reply still counts as the instance answering, so no timeout wait.
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ids(state)).toEqual(['saved']);
    expect(warn).toHaveBeenCalled();
  });

  it('ignores replies to a different request', async () => {
    const ctx = setup({ snapshot: docWith(['saved']) });
    ctx.pub.receivers = 1;
    ctx.pub.onPublish = (channel) => {
      if (channel !== 'board:b1:state-request') return;
      setTimeout(() => ctx.replyFrom(OTHER, '00000000-0000-4000-8000-000000000009', docWith(['stray'])), 5);
    };
    expect(ids(await ctx.live.collect('b1', 100))).toEqual(['saved']);
  });

  it('gives up on silent instances after the timeout and keeps what it has', async () => {
    const ctx = setup({ snapshot: docWith(['saved']) });
    ctx.pub.receivers = 2;
    const started = Date.now();
    const state = await ctx.live.collect('b1', 80);
    expect(Date.now() - started).toBeGreaterThanOrEqual(75);
    expect(ids(state)).toEqual(['saved']);
  });

  it('falls back to local state when the request cannot be published', async () => {
    const ctx = setup({ snapshot: docWith(['saved']) });
    ctx.pub.publish = (): Promise<number> => Promise.reject(new Error('Connection is closed.'));
    expect(ids(await ctx.live.collect('b1', 5000))).toEqual(['saved']);
  });

  it('registers itself as the provider behind the boards-side port', async () => {
    const { port } = setup({ snapshot: docWith(['saved']) });
    expect(ids(await port.collect('b1'))).toEqual(['saved']);
  });
});

describe('BoardLiveState answering other instances', () => {
  it('replies to a state request with its live room state', async () => {
    const room = docWith(['live']);
    const ctx = setup({ room });
    const request = encodeFrame(OTHER, Buffer.from('00000000-0000-4000-8000-000000000001'));
    ctx.sub.emit('messageBuffer', Buffer.from('board:b1:state-request'), request);
    await new Promise((r) => setImmediate(r));

    const reply = ctx.pub.published.find((p) => p.channel === stateReplyChannelFor(OTHER));
    expect(reply).toBeDefined();
    const body = Buffer.from(decodeFrame(reply!.payload).update);
    expect(body.subarray(0, 36).toString('utf8')).toBe('00000000-0000-4000-8000-000000000001');
    expect(ids(new Uint8Array(body.subarray(36)))).toEqual(['live']);
  });

  it('replies with an empty state when it no longer holds the room, so the requester need not time out', async () => {
    const ctx = setup();
    const request = encodeFrame(OTHER, Buffer.from('00000000-0000-4000-8000-000000000001'));
    ctx.sub.emit('messageBuffer', Buffer.from('board:b1:state-request'), request);
    await new Promise((r) => setImmediate(r));

    const reply = ctx.pub.published.find((p) => p.channel === stateReplyChannelFor(OTHER));
    expect(reply).toBeDefined();
    expect(decodeFrame(reply!.payload).update.byteLength).toBe(36);
  });
});

describe('BoardLiveState.collectRemote', () => {
  it("returns only the other instances' live states, without touching the snapshot", async () => {
    const ctx = setup({ snapshot: docWith(['saved']), room: docWith(['local']) });
    ctx.pub.receivers = 2;
    ctx.pub.onPublish = (channel, payload) => {
      if (channel !== 'board:b1:state-request') return;
      const requestId = ctx.requestIdOf(payload);
      setTimeout(() => ctx.replyFrom(OTHER, requestId, docWith(['remote'])), 5);
      // An instance that let the room go answers empty; it adds nothing.
      setTimeout(() => ctx.replyFrom(THIRD, requestId, new Uint8Array()), 5);
    };
    const states = await ctx.live.collectRemote('b1', 5000);
    expect(states.map((s) => ids(s))).toEqual([['remote']]);
    expect(ctx.snapshots.loadLatest).not.toHaveBeenCalled();
  });

  it('drops malformed replies so the caller can apply the rest safely', async () => {
    const ctx = setup();
    ctx.pub.receivers = 2;
    ctx.pub.onPublish = (channel, payload) => {
      if (channel !== 'board:b1:state-request') return;
      const requestId = ctx.requestIdOf(payload);
      setTimeout(() => ctx.replyFrom(OTHER, requestId, new Uint8Array([255, 255, 255, 255])), 5);
      setTimeout(() => ctx.replyFrom(THIRD, requestId, docWith(['ok'])), 5);
    };
    const states = await ctx.live.collectRemote('b1', 5000);
    expect(states.map((s) => ids(s))).toEqual([['ok']]);
  });

  it('resolves empty (never rejects) when Redis is unreachable', async () => {
    const ctx = setup();
    ctx.pub.publish = (): Promise<number> => Promise.reject(new Error('Connection is closed.'));
    await expect(ctx.live.collectRemote('b1', 5000)).resolves.toEqual([]);
  });
});

describe('BoardLiveState on Redis Cluster', () => {
  it('waits the full window instead of trusting the node-local PUBLISH receiver count', async () => {
    const ctx = setup({ snapshot: docWith(['saved']), cluster: true });
    await new Promise((r) => setImmediate(r));
    // Our node saw no subscribers, but a subscriber on another node still answers.
    ctx.pub.receivers = 0;
    ctx.pub.onPublish = (channel, payload) => {
      if (channel !== 'board:b1:state-request') return;
      const requestId = ctx.requestIdOf(payload);
      setTimeout(() => ctx.replyFrom(OTHER, requestId, docWith(['other-node'])), 30);
    };
    const started = Date.now();
    const state = await ctx.live.collect('b1', 150);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(ids(state)).toEqual(['other-node', 'saved']);
  });
});
