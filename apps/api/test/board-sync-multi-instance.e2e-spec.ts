import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { SYNC_EVENTS } from '@syncflow/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { decodeAwarenessUpdate } from '../src/modules/board-sync/awareness-codec';

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

async function startInstance(): Promise<Instance> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

/** An awareness update for `clientId` at `clock` carrying a user state. */
function awarenessFrom(clientId: number, clock: number): Uint8Array {
  const json = Buffer.from('{"user":{"name":"B"}}', 'utf8');
  return new Uint8Array([1, clientId, clock, json.length, ...json]);
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

  async function newBoard(title: string): Promise<string> {
    const board = await prisma.board.create({
      data: {
        ownerId,
        title,
        members: {
          create: [
            { userId: ownerId, role: 'owner' },
            { userId: memberId, role: 'editor' },
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

    b.socket.emit(SYNC_EVENTS.awareness, awarenessFrom(99, 1));
    await waitFor('A to see B\'s cursor', () => a.awareness.length > 0);
    b.close();

    await waitFor('A to receive B\'s awareness removal', () =>
      a.awareness.some((u) =>
        (decodeAwarenessUpdate(u) ?? []).some((e) => e.clientId === 99 && e.removed),
      ),
    );
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
});
