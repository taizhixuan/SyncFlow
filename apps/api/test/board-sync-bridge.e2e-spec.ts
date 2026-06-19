import { Redis } from 'ioredis';
import { BoardSyncBridge } from '../src/modules/board-sync/board-sync-bridge';
import type { RedisService } from '../src/redis/redis.service';

function bridgeWith(url: string): { bridge: BoardSyncBridge; client: Redis } {
  const client = new Redis(url);
  const svc = { getClient: () => client } as unknown as RedisService;
  const bridge = new BoardSyncBridge(svc);
  bridge.onModuleInit();
  return { bridge, client };
}

describe('BoardSyncBridge cross-instance (e2e)', () => {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379/1';
  let a: { bridge: BoardSyncBridge; client: Redis };
  let b: { bridge: BoardSyncBridge; client: Redis };

  beforeAll(() => {
    a = bridgeWith(url);
    b = bridgeWith(url);
  });

  afterAll(async () => {
    await a.bridge.onModuleDestroy();
    await b.bridge.onModuleDestroy();
    a.client.disconnect();
    b.client.disconnect();
  });

  it('delivers one instance\'s update to the other and de-dups its own', async () => {
    const boardId = `it-${Date.now()}`;
    const onA: number[][] = [];
    const onB: number[][] = [];
    a.bridge.setUpdateHandler((_bid, u) => onA.push(Array.from(u)));
    b.bridge.setUpdateHandler((_bid, u) => onB.push(Array.from(u)));
    a.bridge.register(boardId);
    b.bridge.register(boardId);

    // give SUBSCRIBE a moment to take effect on both connections
    await new Promise((r) => setTimeout(r, 150));

    const received = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('A did not receive B\'s update')), 4000);
      a.bridge.setUpdateHandler((_bid, u) => {
        onA.push(Array.from(u));
        clearTimeout(timer);
        resolve();
      });
    });

    b.bridge.publish(boardId, new Uint8Array([42, 43]));
    await received;

    expect(onA.some((u) => u[0] === 42 && u[1] === 43)).toBe(true);
    expect(onB).toHaveLength(0); // B must not receive its own publish
  }, 10000);
});
