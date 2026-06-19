import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PREFIX = '/api/v1';

/** Build valid Yjs snapshot bytes whose `elements` map has the given ids. */
function snapshotBytes(ids: string[]): Buffer<ArrayBuffer> {
  const doc = new Y.Doc();
  doc.transact(() => {
    const els = doc.getMap('elements');
    for (const id of ids) {
      const el = new Y.Map<unknown>();
      el.set('id', id);
      els.set(id, el);
    }
  });
  const update = Y.encodeStateAsUpdate(doc);
  const buf = Buffer.alloc(update.byteLength);
  buf.set(update);
  return buf;
}

interface Account {
  token: string;
  userId: string;
  email: string;
}

describe('VersionHistory (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;

  async function signup(email: string): Promise<Account> {
    const res = await http
      .post(`${PREFIX}/auth/signup`)
      .send({ email, password: 'hist-password', displayName: email.split('@')[0] })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id, email };
  }

  const auth = (a: Account) => ({ Authorization: `Bearer ${a.token}` });

  let owner: Account;
  let viewer: Account;
  let boardId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "users","boards","board_members","refresh_tokens","board_snapshots" RESTART IDENTITY CASCADE',
    );
    http = request(app.getHttpServer());
    owner = await signup('hist-owner@syncflow.app');
    viewer = await signup('hist-viewer@syncflow.app');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a board', async () => {
    const res = await http
      .post(`${PREFIX}/boards`)
      .set(auth(owner))
      .send({ title: 'History Board' })
      .expect(201);
    boardId = res.body.id;
  });

  it('adds viewer member', async () => {
    await http
      .post(`${PREFIX}/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ email: viewer.email, role: 'viewer' })
      .expect(201);
  });

  it('seeds two snapshots directly via Prisma', async () => {
    // A fresh board has no snapshots; seed them directly with VALID Yjs state so
    // restore exercises real reconcile + convergence (not just the REST shape).
    // v1 has element {a}; v2 has {a, b}. Restoring v1 must reconcile the live
    // doc back to {a}.
    await prisma.boardSnapshot.create({
      data: {
        boardId,
        docVersion: 1,
        yjsState: snapshotBytes(['a']),
        reason: 'autosave',
        createdBy: owner.userId,
      },
    });
    await prisma.boardSnapshot.create({
      data: {
        boardId,
        docVersion: 2,
        yjsState: snapshotBytes(['a', 'b']),
        reason: 'autosave',
        createdBy: owner.userId,
      },
    });
  });

  it('GET versions returns snapshots newest-first', async () => {
    const res = await http
      .get(`${PREFIX}/boards/${boardId}/versions`)
      .set(auth(owner))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].docVersion).toBe(2);
    expect(res.body[1].docVersion).toBe(1);
  });

  it('viewer gets 403 on restore', async () => {
    await http
      .post(`${PREFIX}/boards/${boardId}/versions/1/restore`)
      .set(auth(viewer))
      .expect(403);
  });

  it('owner can restore a version and new restore entry appears', async () => {
    const res = await http
      .post(`${PREFIX}/boards/${boardId}/versions/1/restore`)
      .set(auth(owner))
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.docVersion).toBe('number');
    expect(res.body.docVersion).toBeGreaterThan(2);

    // Verify a new snapshot with reason 'restore' was added
    const list = await http
      .get(`${PREFIX}/boards/${boardId}/versions`)
      .set(auth(owner))
      .expect(200);
    expect(list.body[0].reason).toBe('restore');
  });

  it('non-member gets 403 on version list', async () => {
    const stranger = await signup('hist-stranger@syncflow.app');
    await http
      .get(`${PREFIX}/boards/${boardId}/versions`)
      .set(auth(stranger))
      .expect(403);
  });
});
