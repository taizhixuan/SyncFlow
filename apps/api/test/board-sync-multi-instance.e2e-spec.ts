import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { Redis } from 'ioredis';
import * as Y from 'yjs';
import { SYNC_EVENTS, clockAckSchema, type ClockAck } from '@syncflow/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { decodeAwarenessEntries, decodeAwarenessUpdate, encodeAwarenessUpdate } from '../src/modules/board-sync/awareness-codec';
import { BoardSyncBridge } from '../src/modules/board-sync/board-sync-bridge';
import { RoomManager } from '../src/modules/board-sync/room-manager';
import { SnapshotService } from '../src/modules/board-sync/snapshot.service';

const PREFIX = '/api/v1';

/**
 * Two API instances in one process, sharing Postgres and Redis exactly like two
 * Render instances behind a load balancer. Each has its own Socket.io server,
 * RoomManager and Redis bridge, so anything that reaches a client on the other
 * instance must have crossed Redis.
 */
interface Instance {
  app: INestApplication;
  url: string;
}

/** `flushDelayMs` stretches the snapshot debounce so a test can act on edits only a live room holds. */
async function startInstance(opts: { flushDelayMs?: number } = {}): Promise<Instance> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.flushDelayMs !== undefined) {
    const flushDelayMs = opts.flushDelayMs;
    builder.overrideProvider(RoomManager).useFactory({
      factory: (s: SnapshotService) => new RoomManager(s, { flushDelayMs }),
      inject: [SnapshotService],
    });
  }
  const mod = await builder.compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.listen(0);
  const addr = app.getHttpServer().address();
  return { app, url: `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}` };
}

/** A socket client that mirrors the board doc and records what it receives. */
class TestClient {
  readonly doc = new Y.Doc();
  readonly awareness: Uint8Array[] = [];
  awarenessRequests = 0;
  error: { code: string } | null = null;
  disconnected = false;

  private constructor(readonly socket: Socket) {
    socket.on(SYNC_EVENTS.update, (u: ArrayBuffer) => Y.applyUpdate(this.doc, new Uint8Array(u)));
    socket.on(SYNC_EVENTS.awareness, (u: ArrayBuffer) => this.awareness.push(new Uint8Array(u)));
    socket.on(SYNC_EVENTS.awarenessRequest, () => {
      this.awarenessRequests += 1;
    });
    socket.on(SYNC_EVENTS.error, (e: { code: string }) => {
      this.error = e;
    });
    socket.on('disconnect', () => {
      this.disconnected = true;
    });
  }

  /** Resolves once the gateway finished the handshake (serverSync is its last step). */
  static connect(url: string, token: string, boardId: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = io(url, {
        auth: { token },
        query: { boardId },
        transports: ['websocket'],
        reconnection: false,
      });
      const client = new TestClient(socket);
      socket.once(SYNC_EVENTS.serverSync, (u: ArrayBuffer) => {
        Y.applyUpdate(client.doc, new Uint8Array(u));
        resolve(client);
      });
      socket.once(SYNC_EVENTS.error, (e: unknown) => reject(new Error(`handshake rejected: ${JSON.stringify(e)}`)));
      socket.once('connect_error', reject);
    });
  }

  /** Make a local edit and send it as an incremental update, like the web client. */
  edit(fn: (elements: Y.Map<unknown>) => void): void {
    const before = Y.encodeStateVector(this.doc);
    this.doc.transact(() => fn(this.doc.getMap('elements')));
    this.socket.emit(SYNC_EVENTS.update, Y.encodeStateAsUpdate(this.doc, before));
  }

  elementIds(): string[] {
    return Object.keys(this.doc.getMap('elements').toJSON()).sort();
  }

  close(): void {
    this.socket.disconnect();
  }
}

async function waitFor(what: string, cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function shape(id: string, extra: Record<string, unknown> = {}): Y.Map<unknown> {
  const el = new Y.Map<unknown>();
  el.set('id', id);
  for (const [k, v] of Object.entries(extra)) el.set(k, v);
  return el;
}

/** An awareness update for `clientId` at `clock` carrying `userId`'s presence. */
function awarenessFrom(clientId: number, clock: number, userId: string): Uint8Array {
  const state = JSON.stringify({ user: { id: userId, name: 'B', color: '#222' }, cursor: { x: 1, y: 1 } });
  return encodeAwarenessUpdate([{ clientId, clock, state }]);
}

/** Every clientID a client has received a (non-removal) awareness state for. */
function announcedClientIds(c: TestClient): number[] {
  return c.awareness.flatMap((u) => (decodeAwarenessUpdate(u) ?? []).filter((e) => !e.removed).map((e) => e.clientId));
}

describe('BoardSync across two instances (e2e)', () => {
  let one: Instance;
  let two: Instance;
  let prisma: PrismaService;
  let ownerId: string;
  let memberId: string;
  let ownerToken: string;
  let memberToken: string;
  const clients: TestClient[] = [];

  async function connect(inst: Instance, token: string, boardId: string): Promise<TestClient> {
    const c = await TestClient.connect(inst.url, token, boardId);
    clients.push(c);
    return c;
  }

  async function newBoard(title: string, memberRole: 'editor' | 'viewer' = 'editor'): Promise<string> {
    const board = await prisma.board.create({
      data: {
        ownerId,
        title,
        members: {
          create: [
            { userId: ownerId, role: 'owner' },
            { userId: memberId, role: memberRole },
          ],
        },
      },
    });
    return board.id;
  }

  beforeAll(async () => {
    one = await startInstance();
    two = await startInstance();
    prisma = one.app.get(PrismaService);
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const owner = await prisma.user.create({
      data: { email: `multi-owner-${stamp}@t.app`, displayName: 'Owner', color: '#111', passwordHash: 'x' },
    });
    const member = await prisma.user.create({
      data: { email: `multi-member-${stamp}@t.app`, displayName: 'Member', color: '#222', passwordHash: 'x' },
    });
    ownerId = owner.id;
    memberId = member.id;
    const tokens = one.app.get(TokenService);
    ownerToken = tokens.signAccessToken({ sub: owner.id, email: owner.email });
    memberToken = tokens.signAccessToken({ sub: member.id, email: member.email });
  });

  afterEach(() => {
    for (const c of clients.splice(0)) c.close();
  });

  afterAll(async () => {
    await one.app.close();
    await two.app.close();
  });

  it('converges edits made on different instances', async () => {
    const boardId = await newBoard('converge');
    const a = await connect(one, ownerToken, boardId);
    const b = await connect(two, memberToken, boardId);
    await sleep(200); // let both instances' Redis SUBSCRIBE take effect

    a.edit((els) => els.set('from-a', shape('from-a')));
    b.edit((els) => els.set('from-b', shape('from-b')));

    await waitFor('A and B to hold both shapes', () =>
      [a, b].every((c) => c.elementIds().join() === 'from-a,from-b'),
    );
  }, 20000);

  it('relays a large (> 1 MB) board update instead of dropping the connection', async () => {
    const boardId = await newBoard('large');
    const a = await connect(one, ownerToken, boardId);
    const b = await connect(two, memberToken, boardId);
    await sleep(200);

    a.edit((els) => els.set('big', shape('big', { text: 'x'.repeat(2 * 1024 * 1024) })));

    await waitFor('B to receive the 2 MB shape', () => b.elementIds().includes('big'), 15000);
    expect(a.disconnected).toBe(false);
  }, 30000);

  it('asks peers on the other instance for awareness when someone joins', async () => {
    const boardId = await newBoard('awareness-request');
    const a = await connect(one, ownerToken, boardId);
    await sleep(200);
    await connect(two, memberToken, boardId);
    await waitFor('A to be asked for its awareness', () => a.awarenessRequests > 0);
  }, 20000);

  it('clears a disconnected client\'s cursor for peers on the other instance', async () => {
    const boardId = await newBoard('ghost-cursor');
    const a = await connect(one, ownerToken, boardId);
    const b = await connect(two, memberToken, boardId);
    await sleep(200);

    b.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(99, 1, memberId));
    await waitFor('A to see B\'s cursor', () => a.awareness.length > 0);
    b.close();

    await waitFor('A to receive B\'s awareness removal', () =>
      a.awareness.some((u) =>
        (decodeAwarenessUpdate(u) ?? []).some((e) => e.clientId === 99 && e.removed),
      ),
    );
  }, 20000);

  it("never shows peers a viewer's cursor spoofed as another user, here or on another instance", async () => {
    const boardId = await newBoard('spoof', 'viewer');
    const owner = await connect(one, ownerToken, boardId);
    const viewer = await connect(two, memberToken, boardId);
    const sameInstancePeer = await connect(two, ownerToken, boardId);
    await sleep(200);

    // The owner's own cursor binds clientID 111 to the owner's socket.
    owner.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(111, 1, ownerId));
    await waitFor("the owner's cursor to reach the viewer", () => announcedClientIds(viewer).includes(111));

    // Spoof 1: a fresh clientID wearing the owner's identity.
    viewer.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(444, 1, ownerId));
    // Spoof 2: removing a clientID the viewer never owned (the peer on the
    // viewer's own instance holds it).
    sameInstancePeer.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(222, 1, ownerId));
    await waitFor("the peer's cursor to reach the viewer", () => announcedClientIds(viewer).includes(222));
    viewer.socket.emit(SYNC_EVENTS.awareness, encodeAwarenessUpdate([{ clientId: 222, clock: 5, state: 'null' }]));
    // Then a legitimate cursor, so we know the viewer's messages do get through.
    viewer.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(555, 1, memberId));

    await waitFor("the viewer's genuine cursor to reach both peers", () =>
      [owner, sameInstancePeer].every((c) => announcedClientIds(c).includes(555)),
    );
    await sleep(200);
    for (const peer of [owner, sameInstancePeer]) {
      expect(announcedClientIds(peer)).not.toContain(444);
    }
    const removed = (c: TestClient): boolean =>
      c.awareness.some((u) => (decodeAwarenessUpdate(u) ?? []).some((e) => e.clientId === 222 && e.removed));
    expect(removed(owner)).toBe(false);
  }, 20000);

  it("does not let a socket on instance 2 hijack a clientID another user owns on instance 1", async () => {
    const boardId = await newBoard('hijack', 'viewer');
    const owner = await connect(one, ownerToken, boardId);
    const viewer = await connect(two, memberToken, boardId);
    const peer = await connect(two, ownerToken, boardId);
    await sleep(200);

    owner.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(111, 1, ownerId));
    await waitFor("the owner's cursor to reach instance 2", () =>
      [viewer, peer].every((c) => announcedClientIds(c).includes(111)),
    );

    // The viewer's own identity, but the owner's clientID and a newer clock:
    // instance 2 has no local owner for 111, only the claim from instance 1.
    viewer.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(111, 50, memberId));
    viewer.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(555, 1, memberId));
    await waitFor("the viewer's genuine cursor to reach both peers", () =>
      [owner, peer].every((c) => announcedClientIds(c).includes(555)),
    );
    await sleep(200);

    const hijacked = (c: TestClient): boolean =>
      c.awareness.some((u) =>
        (decodeAwarenessEntries(u) ?? []).some((e) => e.clientId === 111 && e.state.includes(memberId)),
      );
    expect(hijacked(peer)).toBe(false);
    expect(hijacked(owner)).toBe(false);
  }, 20000);

  it('catches up edits missed while an instance was cut off from Redis', async () => {
    const boardId = await newBoard('redis-outage');
    const a = await connect(one, ownerToken, boardId);
    const b = await connect(two, memberToken, boardId);
    await sleep(200);
    const bridge = one.app.get(BoardSyncBridge) as unknown as { sub: Redis; pub: Redis };

    const reconnect = async (): Promise<void> => {
      await Promise.all(
        [bridge.sub, bridge.pub].filter((c) => c.status === 'end').map((c) => c.connect()),
      );
    };
    try {
      // Instance 1 stops hearing Redis: B's edit is published into the void for it.
      bridge.sub.disconnect();
      await waitFor("instance 1's subscriber to close", () => bridge.sub.status === 'end');
      b.edit((els) => els.set('from-b', shape('from-b')));
      await sleep(300);
      expect(a.elementIds()).not.toContain('from-b');

      // Instance 1 can no longer publish either: A's edit never leaves it.
      bridge.pub.disconnect();
      await waitFor("instance 1's publisher to close", () => bridge.pub.status === 'end');
      a.edit((els) => els.set('from-a', shape('from-a')));
      await sleep(300);
      expect(b.elementIds()).not.toContain('from-a');

      await reconnect();
      await waitFor('A and B to converge after the reconnect', () =>
        [a, b].every((c) => c.elementIds().join() === 'from-a,from-b'),
      );
    } finally {
      // Instance 1 serves later tests; never leave it without Redis.
      await reconnect();
    }
  }, 20000);

  it('delivers a restore performed on instance 1 to a client on instance 2', async () => {
    const boardId = await newBoard('restore');
    // v1 = {a}; v2 = v1 + {b} + a comment + a running timer. Built on one doc
    // so the versions share history, like real autosaves do.
    const doc = new Y.Doc();
    doc.getMap('elements').set('a', shape('a'));
    const v1 = Y.encodeStateAsUpdate(doc);
    doc.transact(() => {
      doc.getMap('elements').set('b', shape('b'));
      doc.getMap('comments').set('c1', { id: 'c1', text: 'later' });
      doc.getMap('meta').set('timer', { running: true });
    });
    const v2 = Y.encodeStateAsUpdate(doc);
    await prisma.boardSnapshot.createMany({
      data: [
        { boardId, docVersion: 1, yjsState: Buffer.from(v1) },
        { boardId, docVersion: 2, yjsState: Buffer.from(v2) },
      ],
    });

    // Only instance 2 has the board open; instance 1 serves the REST call.
    const b = await connect(two, memberToken, boardId);
    await sleep(200);
    expect(b.elementIds()).toEqual(['a', 'b']);

    const res = await request(one.app.getHttpServer())
      .post(`${PREFIX}/boards/${boardId}/versions/1/restore`)
      .set({ Authorization: `Bearer ${ownerToken}` })
      .expect(201);
    expect(res.body.docVersion).toBe(3);

    await waitFor('B to converge on the restored version', () => b.elementIds().join() === 'a');
    expect(b.doc.getMap('comments').size).toBe(0);
    expect(b.doc.getMap('meta').size).toBe(0);
  }, 20000);

  it('disconnects a member removed via another instance', async () => {
    const boardId = await newBoard('revoke');
    const b = await connect(two, memberToken, boardId);
    await sleep(200);

    await request(one.app.getHttpServer())
      .delete(`${PREFIX}/boards/${boardId}/members/${memberId}`)
      .set({ Authorization: `Bearer ${ownerToken}` })
      .expect(204);

    await waitFor('the removed member to be disconnected', () => b.disconnected);
    expect(b.error?.code).toBe('forbidden');
  }, 20000);

  it('stops an editor demoted via another instance from writing', async () => {
    const boardId = await newBoard('demote');
    const a = await connect(one, ownerToken, boardId);
    const b = await connect(two, memberToken, boardId);
    await sleep(200);

    await request(one.app.getHttpServer())
      .patch(`${PREFIX}/boards/${boardId}/members/${memberId}`)
      .set({ Authorization: `Bearer ${ownerToken}` })
      .send({ role: 'viewer' })
      .expect(200);
    await sleep(500); // the demotion crosses Redis and is re-checked against the DB

    b.edit((els) => els.set('after-demotion', shape('after-demotion')));
    a.edit((els) => els.set('owner-marker', shape('owner-marker')));
    await waitFor('B to receive the owner\'s later edit', () => b.elementIds().includes('owner-marker'));
    await sleep(300);
    expect(a.elementIds()).not.toContain('after-demotion');
    expect(b.disconnected).toBe(false);
  }, 20000);

  it('persists edits still in the debounce window when an instance shuts down', async () => {
    const three = await startInstance();
    const boardId = await newBoard('shutdown');
    const c = await TestClient.connect(three.url, ownerToken, boardId);
    c.edit((els) => els.set('unsaved', shape('unsaved')));
    await waitFor('the edit to reach the server room', () => c.elementIds().includes('unsaved'));
    await sleep(200);

    await three.app.close();
    c.close();

    const latest = await prisma.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
    });
    expect(latest).not.toBeNull();
    const saved = new Y.Doc();
    Y.applyUpdate(saved, new Uint8Array(latest!.yjsState));
    expect(saved.getMap('elements').has('unsaved')).toBe(true);
  }, 20000);
  // With a long debounce only the shutdown flush can persist the edit, and it
  // must run before Prisma disconnects — otherwise every deploy drops edits.
  it('saves edits on shutdown before the database connection closes', async () => {
    const slow = await startInstance({ flushDelayMs: 60_000 });
    const boardId = await newBoard('shutdown-order');
    const c = await TestClient.connect(slow.url, ownerToken, boardId);
    c.edit((els) => els.set('pending', shape('pending')));
    await waitFor('the edit to reach the server room', () => c.elementIds().includes('pending'));
    await sleep(200);

    await slow.app.close();
    c.close();

    const latest = await prisma.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
    });
    expect(latest).not.toBeNull();
    const saved = new Y.Doc();
    Y.applyUpdate(saved, new Uint8Array(latest!.yjsState));
    expect(saved.getMap('elements').has('pending')).toBe(true);
  }, 20000);

  it('answers board:clock with the server time, for viewers too', async () => {
    const boardId = await newBoard('clock', 'viewer');
    const viewer = await connect(two, memberToken, boardId);
    const before = Date.now();
    const ack = await new Promise<ClockAck>((resolve) => {
      viewer.socket.emit(SYNC_EVENTS.clock, (a: ClockAck) => resolve(a));
    });
    const { serverNow } = clockAckSchema.parse(ack);
    expect(serverNow).toBeGreaterThanOrEqual(before);
    expect(serverNow).toBeLessThanOrEqual(Date.now());
  }, 20000);

  describe("with edits held only in another instance's live room", () => {
    // A long debounce keeps edits unsaved for the whole test, so the only copy
    // of them is instance B's in-memory room.
    let slowA: Instance;
    let slowB: Instance;

    beforeAll(async () => {
      slowA = await startInstance({ flushDelayMs: 60_000 });
      slowB = await startInstance({ flushDelayMs: 60_000 });
    });

    afterAll(async () => {
      for (const c of clients.splice(0)) c.close();
      await slowA.app.close();
      await slowB.app.close();
    });

    async function savedIds(boardId: string): Promise<string[][]> {
      const rows = await prisma.boardSnapshot.findMany({ where: { boardId }, orderBy: { docVersion: 'asc' } });
      return rows.map((r) => {
        const d = new Y.Doc();
        Y.applyUpdate(d, new Uint8Array(r.yjsState));
        return Object.keys(d.getMap('elements').toJSON()).sort();
      });
    }

    it("opens a board on instance B with the edits still in instance A's debounce, then keeps converging", async () => {
      const boardId = await newBoard('late-open');
      const editor = await connect(slowA, memberToken, boardId);
      const watcher = await connect(slowA, ownerToken, boardId);
      editor.edit((els) => els.set('unsaved', shape('unsaved')));
      await waitFor("the edit to reach A's room", () => watcher.elementIds().includes('unsaved'));
      expect((await savedIds(boardId)).flat()).not.toContain('unsaved');

      // B has never held the board: its room loads from the database, which lacks the edit.
      const late = await connect(slowB, ownerToken, boardId);
      expect(late.elementIds()).toEqual(['unsaved']);

      // Without the unsaved base, this update would sit as pending structs on B forever.
      editor.edit((els) => els.set('later', shape('later')));
      await waitFor('the next edit on A to reach the client on B', () => late.elementIds().join() === 'later,unsaved');
      const next = await connect(slowB, memberToken, boardId);
      expect(next.elementIds()).toEqual(['later', 'unsaved']);
    }, 20000);

    it('duplicating via instance A copies an unsaved edit held on instance B', async () => {
      const boardId = await newBoard('dup-live');
      const editor = await connect(slowB, memberToken, boardId);
      const watcher = await connect(slowB, ownerToken, boardId);
      editor.edit((els) => els.set('unsaved', shape('unsaved')));
      await waitFor("the edit to reach B's room", () => watcher.elementIds().includes('unsaved'));
      expect((await savedIds(boardId)).flat()).not.toContain('unsaved');

      const res = await request(slowA.app.getHttpServer())
        .post(`${PREFIX}/boards/${boardId}/duplicate`)
        .set({ Authorization: `Bearer ${ownerToken}` })
        .expect(201);

      expect(await savedIds(res.body.id)).toEqual([['unsaved']]);
    }, 20000);

    it('restoring via instance A rolls back an unsaved edit held on instance B', async () => {
      const boardId = await newBoard('restore-live');
      const v1 = new Y.Doc();
      v1.getMap('elements').set('a', shape('a'));
      await prisma.boardSnapshot.create({
        data: { boardId, docVersion: 1, yjsState: Buffer.from(Y.encodeStateAsUpdate(v1)) },
      });
      const editor = await connect(slowB, memberToken, boardId);
      const watcher = await connect(slowB, ownerToken, boardId);
      editor.edit((els) => els.set('unsaved', shape('unsaved')));
      await waitFor("the edit to reach B's room", () => watcher.elementIds().join() === 'a,unsaved');
      expect(await savedIds(boardId)).toEqual([['a']]);

      await request(slowA.app.getHttpServer())
        .post(`${PREFIX}/boards/${boardId}/versions/1/restore`)
        .set({ Authorization: `Bearer ${ownerToken}` })
        .expect(201);

      await waitFor('clients on B to lose the unsaved edit', () =>
        [editor, watcher].every((c) => c.elementIds().join() === 'a'),
      );
      expect((await savedIds(boardId)).at(-1)).toEqual(['a']);
    }, 20000);
  });
});
