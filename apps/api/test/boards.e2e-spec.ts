import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PREFIX = '/api/v1';

interface Account {
  token: string;
  userId: string;
  email: string;
}

describe('Boards (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;

  async function signup(email: string): Promise<Account> {
    const res = await http
      .post(`${PREFIX}/auth/signup`)
      .send({ email, password: 'board-password', displayName: email.split('@')[0] })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id, email };
  }

  const auth = (a: Account) => ({ Authorization: `Bearer ${a.token}` });

  let owner: Account;
  let other: Account;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "users","boards","board_members","refresh_tokens" RESTART IDENTITY CASCADE',
    );
    http = request(app.getHttpServer());
    owner = await signup('owner@syncflow.app');
    other = await signup('other@syncflow.app');
  });

  afterAll(async () => {
    await app.close();
  });

  let boardId: string;

  it('creates a board with the caller as owner', async () => {
    const res = await http
      .post(`${PREFIX}/boards`)
      .set(auth(owner))
      .send({ title: 'Roadmap' })
      .expect(201);
    expect(res.body.title).toBe('Roadmap');
    expect(res.body.role).toBe('owner');
    expect(res.body.memberCount).toBe(1);
    boardId = res.body.id;
  });

  it('lists the board for its owner', async () => {
    const res = await http.get(`${PREFIX}/boards`).set(auth(owner)).expect(200);
    expect(res.body.items.map((b: { id: string }) => b.id)).toContain(boardId);
  });

  it('requires auth to list boards', async () => {
    await http.get(`${PREFIX}/boards`).expect(401);
  });

  it('renames the board (owner)', async () => {
    const res = await http
      .patch(`${PREFIX}/boards/${boardId}`)
      .set(auth(owner))
      .send({ title: 'Roadmap 2026' })
      .expect(200);
    expect(res.body.title).toBe('Roadmap 2026');
  });

  it('forbids a non-member from reading the board', async () => {
    await http.get(`${PREFIX}/boards/${boardId}`).set(auth(other)).expect(403);
  });

  it('revokes share links on removal so a removed member cannot rejoin with one', async () => {
    const link = await http
      .post(`${PREFIX}/boards/${boardId}/invites`)
      .set(auth(owner))
      .send({ kind: 'share_link', role: 'editor' })
      .expect(201);
    await http.post(`${PREFIX}/invites/${link.body.token}/accept`).set(auth(other)).expect(201);
    await http.get(`${PREFIX}/boards/${boardId}`).set(auth(other)).expect(200);

    await http
      .delete(`${PREFIX}/boards/${boardId}/members/${other.userId}`)
      .set(auth(owner))
      .expect(204);

    const retry = await http.post(`${PREFIX}/invites/${link.body.token}/accept`).set(auth(other));
    expect(retry.status).toBe(404);
    await http.get(`${PREFIX}/boards/${boardId}`).set(auth(other)).expect(403);
  });

  it('adds a member by email, who can then read it', async () => {
    await http
      .post(`${PREFIX}/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ email: other.email, role: 'editor' })
      .expect(201);
    const res = await http.get(`${PREFIX}/boards/${boardId}`).set(auth(other)).expect(200);
    expect(res.body.role).toBe('editor');
  });

  it('forbids an editor from renaming or deleting', async () => {
    await http
      .patch(`${PREFIX}/boards/${boardId}`)
      .set(auth(other))
      .send({ title: 'hijack' })
      .expect(403);
    await http.delete(`${PREFIX}/boards/${boardId}`).set(auth(other)).expect(403);
  });

  it('duplicates a board, including its content, into a new board owned by the caller', async () => {
    const doc = new Y.Doc();
    const shape = new Y.Map<unknown>();
    shape.set('id', 'shape-1');
    doc.getMap('elements').set('shape-1', shape);
    await prisma.boardSnapshot.create({
      data: { boardId, docVersion: 1, yjsState: Buffer.from(Y.encodeStateAsUpdate(doc)) },
    });

    // Any member may duplicate (the editor here), and becomes the copy's owner.
    const res = await http
      .post(`${PREFIX}/boards/${boardId}/duplicate`)
      .set(auth(other))
      .expect(201);
    expect(res.body.id).not.toBe(boardId);
    expect(res.body.role).toBe('owner');
    expect(res.body.ownerId).toBe(other.userId);

    const copied = await prisma.boardSnapshot.findFirst({
      where: { boardId: res.body.id },
      orderBy: { docVersion: 'desc' },
    });
    expect(copied).not.toBeNull();
    const copyDoc = new Y.Doc();
    Y.applyUpdate(copyDoc, new Uint8Array(copied!.yjsState));
    expect(copyDoc.getMap('elements').has('shape-1')).toBe(true);
  });

  it('duplicates an empty board without inventing a snapshot', async () => {
    const empty = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Blank' }).expect(201);
    const res = await http
      .post(`${PREFIX}/boards/${empty.body.id}/duplicate`)
      .set(auth(owner))
      .expect(201);
    expect(await prisma.boardSnapshot.count({ where: { boardId: res.body.id } })).toBe(0);
  });

  it('changes a member role and then revokes access', async () => {
    await http
      .patch(`${PREFIX}/boards/${boardId}/members/${other.userId}`)
      .set(auth(owner))
      .send({ role: 'viewer' })
      .expect(200);
    await http
      .delete(`${PREFIX}/boards/${boardId}/members/${other.userId}`)
      .set(auth(owner))
      .expect(204);
    await http.get(`${PREFIX}/boards/${boardId}`).set(auth(other)).expect(403);
  });

  it('soft-deletes the board (owner) and removes it from the list', async () => {
    await http.delete(`${PREFIX}/boards/${boardId}`).set(auth(owner)).expect(204);
    const res = await http.get(`${PREFIX}/boards`).set(auth(owner)).expect(200);
    expect(res.body.items.map((b: { id: string }) => b.id)).not.toContain(boardId);
  });
});
