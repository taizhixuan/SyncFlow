import { EventEmitter } from 'node:events';
import {
  BoardSyncBridge,
  channelFor,
  boardIdFromChannel,
  encodeFrame,
  decodeFrame,
  INSTANCE_ID_BYTES,
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
  async subscribe(channel: string): Promise<void> {
    this.subscribed.push(channel);
  }
  async unsubscribe(channel: string): Promise<void> {
    this.unsubscribed.push(channel);
  }
  publish(channel: string, payload: Buffer): void {
    this.published.push({ channel, payload });
  }
  async quit(): Promise<void> {}
}

function makeBridge() {
  const pub = new FakeRedis();
  const svc = { getClient: () => pub } as unknown as import('../../redis/redis.service').RedisService;
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

  it('maps board id to channel and back', () => {
    expect(channelFor('b1')).toBe('board:b1:updates');
    expect(boardIdFromChannel('board:b1:updates')).toBe('b1');
    expect(boardIdFromChannel('nope')).toBeNull();
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
