import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { SnapshotService } from '../src/modules/board-sync/snapshot.service';

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

  it("GET versions names each version's author", async () => {
    const res = await http
      .get(`${PREFIX}/boards/${boardId}/versions`)
      .set(auth(owner))
      .expect(200);
    expect(res.body[0].createdBy).toBe(owner.userId);
    expect(res.body[0].createdByName).toBe('hist-owner');
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

  it('rejects a non-numeric version with 400 instead of a 500', async () => {
    await http
      .post(`${PREFIX}/boards/${boardId}/versions/latest/restore`)
      .set(auth(owner))
      .expect(400);
  });

  it('returns 404 for a version that does not exist', async () => {
    await http
      .post(`${PREFIX}/boards/${boardId}/versions/999/restore`)
      .set(auth(owner))
      .expect(404);
  });

  it('persists the reconciled state, so the restored version really is the latest', async () => {
    const latest = await prisma.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
    });
    expect(latest!.reason).toBe('restore');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(latest!.yjsState));
    // v2 {a, b} was the latest before restoring v1 {a}: b must be deleted in the
    // saved forward state, not merely absent from an old copy of v1.
    expect(Object.keys(doc.getMap('elements').toJSON())).toEqual(['a']);
  });

  it('non-member gets 403 on version list', async () => {
    const stranger = await signup('hist-stranger@syncflow.app');
    await http
      .get(`${PREFIX}/boards/${boardId}/versions`)
      .set(auth(stranger))
      .expect(403);
  });

  describe('retention pruning', () => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    let pruned: string;

    it('thins old autosaves, keeps checkpoints and the latest, and leaves sparse versions', async () => {
      const board = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Pruned' }).expect(201);
      pruned = board.body.id as string;
      const now = new Date();
      const dayStart = Math.floor((now.getTime() - 40 * DAY) / DAY) * DAY;
      const hourStart = Math.floor((now.getTime() - 2 * DAY) / HOUR) * HOUR;
      const seeds: Array<{ v: number; at: number; reason: 'autosave' | 'manual' | 'restore' }> = [
        { v: 1, at: dayStart + 1 * HOUR, reason: 'autosave' },
        { v: 2, at: dayStart + 5 * HOUR, reason: 'autosave' },
        { v: 3, at: dayStart + 3 * HOUR, reason: 'manual' },
        { v: 4, at: hourStart + 10 * 60_000, reason: 'autosave' },
        { v: 5, at: hourStart + 40 * 60_000, reason: 'autosave' },
        { v: 6, at: hourStart + 50 * 60_000, reason: 'restore' },
        { v: 7, at: now.getTime() - 2 * HOUR, reason: 'autosave' },
        { v: 8, at: now.getTime() - HOUR, reason: 'autosave' },
      ];
      for (const seed of seeds) {
        await prisma.boardSnapshot.create({
          data: {
            boardId: pruned,
            docVersion: seed.v,
            yjsState: snapshotBytes([`el-${seed.v}`]),
            reason: seed.reason,
            createdAt: new Date(seed.at),
          },
        });
      }

      const result = await app.get(SnapshotService).pruneHistory(now, { maxBoards: 1000 });
      expect(result.deleted).toBeGreaterThanOrEqual(2);

      const left = await prisma.boardSnapshot.findMany({
        where: { boardId: pruned },
        orderBy: { docVersion: 'asc' },
        select: { docVersion: true },
      });
      expect(left.map((r) => r.docVersion)).toEqual([2, 3, 5, 6, 7, 8]);

      const list = await http.get(`${PREFIX}/boards/${pruned}/versions`).set(auth(owner)).expect(200);
      expect(list.body.map((v: { docVersion: number }) => v.docVersion)).toEqual([8, 7, 6, 5, 3, 2]);
    });

    it('never deletes the latest snapshot, even when every row is old', async () => {
      const board = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Stale' }).expect(201);
      const stale = board.body.id as string;
      const now = new Date();
      const dayStart = Math.floor((now.getTime() - 60 * DAY) / DAY) * DAY;
      // v2 is the head but (artificially) older than v1 within the same day.
      const rows: Array<[number, number]> = [
        [1, 9],
        [2, 4],
      ];
      for (const [v, h] of rows) {
        await prisma.boardSnapshot.create({
          data: {
            boardId: stale,
            docVersion: v,
            yjsState: snapshotBytes(['x']),
            createdAt: new Date(dayStart + h * HOUR),
          },
        });
      }
      await app.get(SnapshotService).pruneHistory(now, { maxBoards: 1000 });
      const left = await prisma.boardSnapshot.findMany({ where: { boardId: stale }, select: { docVersion: true } });
      expect(left.map((r) => r.docVersion).sort()).toEqual([1, 2]);
    });

    it('restores a surviving old version by number and 404s a pruned one', async () => {
      await http.post(`${PREFIX}/boards/${pruned}/versions/1/restore`).set(auth(owner)).expect(404);
      const res = await http.post(`${PREFIX}/boards/${pruned}/versions/2/restore`).set(auth(owner)).expect(201);
      expect(res.body.docVersion).toBe(9);
    });
  });
});
