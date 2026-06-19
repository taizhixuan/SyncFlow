import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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
    const prisma = app.get(PrismaService);
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

  it('duplicates a board into a new board owned by the caller', async () => {
    const res = await http
      .post(`${PREFIX}/boards/${boardId}/duplicate`)
      .set(auth(owner))
      .expect(201);
    expect(res.body.id).not.toBe(boardId);
    expect(res.body.role).toBe('owner');
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
