import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { BoardAccessEvents, type BoardAccessChange } from '../src/boards/board-access-events';

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

  /** A user without going through /auth/signup, which is throttled to 10 per 10 minutes. */
  async function seedUser(email: string): Promise<Account> {
    const user = await prisma.user.create({
      data: { email, displayName: email.split('@')[0]!, color: '#3B5BFF', passwordHash: 'x' },
    });
    const token = app.get(TokenService).signAccessToken({ sub: user.id, email: user.email });
    return { token, userId: user.id, email };
  }

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

  describe('pagination', () => {
    let pager: Account;
    const created: string[] = [];

    beforeAll(async () => {
      pager = await seedUser('pager@syncflow.app');
      for (let i = 0; i < 5; i += 1) {
        const res = await http.post(`${PREFIX}/boards`).set(auth(pager)).send({ title: `P${i}` }).expect(201);
        created.push(res.body.id as string);
        // Distinct timestamps so the expected order never hinges on a same-millisecond tie.
        await prisma.board.update({
          where: { id: res.body.id as string },
          data: { updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) },
        });
      }
    });

    it('pages GET /boards newest-updated first and ends with a null cursor', async () => {
      const seen: string[] = [];
      const sizes: number[] = [];
      let cursor: string | null = null;
      do {
        const query: Record<string, string> = { limit: '2' };
        if (cursor) query.cursor = cursor;
        const res = await http.get(`${PREFIX}/boards`).query(query).set(auth(pager)).expect(200);
        sizes.push(res.body.items.length as number);
        seen.push(...(res.body.items as Array<{ id: string }>).map((b) => b.id));
        cursor = res.body.nextCursor as string | null;
      } while (cursor);
      expect(sizes).toEqual([2, 2, 1]);
      expect(seen).toEqual([...created].reverse());
    });

    it('returns everything in one page by default', async () => {
      const res = await http.get(`${PREFIX}/boards`).set(auth(pager)).expect(200);
      expect(res.body.items).toHaveLength(5);
      expect(res.body.nextCursor).toBeNull();
    });

    it('rejects a tampered cursor with 400 and an out-of-range limit with 422', async () => {
      await http.get(`${PREFIX}/boards`).query({ cursor: 'not-a-cursor' }).set(auth(pager)).expect(400);
      const forged = Buffer.from(JSON.stringify({ t: 'nope', id: 'x' })).toString('base64url');
      await http.get(`${PREFIX}/boards`).query({ cursor: forged }).set(auth(pager)).expect(400);
      await http.get(`${PREFIX}/boards`).query({ limit: '0' }).set(auth(pager)).expect(422);
      await http.get(`${PREFIX}/boards`).query({ limit: '101' }).set(auth(pager)).expect(422);
    });

    it('pages GET /boards/:id/members in join order', async () => {
      const board = created[0]!;
      const joined: string[] = [pager.userId];
      for (let i = 0; i < 3; i += 1) {
        const m = await seedUser(`pager-member-${i}@syncflow.app`);
        await http
          .post(`${PREFIX}/boards/${board}/members`)
          .set(auth(pager))
          .send({ email: m.email, role: 'viewer' })
          .expect(201);
        joined.push(m.userId);
      }
      const first = await http
        .get(`${PREFIX}/boards/${board}/members`)
        .query({ limit: 3 })
        .set(auth(pager))
        .expect(200);
      expect(first.body.items).toHaveLength(3);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await http
        .get(`${PREFIX}/boards/${board}/members`)
        .query({ limit: 3, cursor: first.body.nextCursor as string })
        .set(auth(pager))
        .expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.nextCursor).toBeNull();
      const ids = [...first.body.items, ...second.body.items].map((m: { userId: string }) => m.userId);
      expect(ids).toEqual(joined);
      await http
        .get(`${PREFIX}/boards/${board}/members`)
        .query({ cursor: 'garbage' })
        .set(auth(pager))
        .expect(400);
    });
  });

  describe('add member by email', () => {
    let host: Account;
    let guest: Account;
    let board: string;

    beforeAll(async () => {
      host = await seedUser('add-host@syncflow.app');
      guest = await seedUser('add-guest@syncflow.app');
      const res = await http.post(`${PREFIX}/boards`).set(auth(host)).send({ title: 'Add' }).expect(201);
      board = res.body.id as string;
    });

    it('normalizes the email and returns the member in list-item shape', async () => {
      const res = await http
        .post(`${PREFIX}/boards/${board}/members`)
        .set(auth(host))
        .send({ email: '  ADD-Guest@SyncFlow.app ', role: 'viewer' })
        .expect(201);
      expect(res.body).toEqual({
        userId: guest.userId,
        displayName: 'add-guest',
        email: guest.email,
        color: expect.any(String),
        role: 'viewer',
        acceptedAt: expect.any(String),
      });
      const list = await http.get(`${PREFIX}/boards/${board}/members`).set(auth(host)).expect(200);
      expect(list.body.items).toContainEqual(res.body);
    });

    it('409 when already a member (the owner included), 404 for an unknown email', async () => {
      await http
        .post(`${PREFIX}/boards/${board}/members`)
        .set(auth(host))
        .send({ email: guest.email, role: 'editor' })
        .expect(409);
      await http
        .post(`${PREFIX}/boards/${board}/members`)
        .set(auth(host))
        .send({ email: host.email, role: 'editor' })
        .expect(409);
      await http
        .post(`${PREFIX}/boards/${board}/members`)
        .set(auth(host))
        .send({ email: 'nobody-here@syncflow.app', role: 'editor' })
        .expect(404);
    });
  });

  describe('filtering the board list on the server', () => {
    let finder: Account;
    let sharer: Account;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      finder = await seedUser('finder@syncflow.app');
      sharer = await seedUser('sharer@syncflow.app');
      const make = async (who: Account, title: string, at: number): Promise<void> => {
        const res = await http.post(`${PREFIX}/boards`).set(auth(who)).send({ title }).expect(201);
        ids[title] = res.body.id as string;
        await prisma.board.update({
          where: { id: res.body.id as string },
          data: { updatedAt: new Date(Date.UTC(2026, 1, 1, 0, 0, at)) },
        });
      };
      await make(finder, 'Alpha Roadmap', 1);
      await make(finder, 'Beta notes', 2);
      await make(sharer, 'Shared ROADMAP', 3);
      await make(sharer, 'Not shared roadmap', 4);
      await http
        .post(`${PREFIX}/boards/${ids['Shared ROADMAP']!}/members`)
        .set(auth(sharer))
        .send({ email: finder.email, role: 'editor' })
        .expect(201);
    });

    const titles = (body: { items: Array<{ title: string }> }): string[] => body.items.map((b) => b.title);

    it('narrows to owned or shared boards', async () => {
      const owned = await http.get(`${PREFIX}/boards`).query({ role: 'owned' }).set(auth(finder)).expect(200);
      expect(titles(owned.body)).toEqual(['Beta notes', 'Alpha Roadmap']);
      const shared = await http.get(`${PREFIX}/boards`).query({ role: 'shared' }).set(auth(finder)).expect(200);
      expect(titles(shared.body)).toEqual(['Shared ROADMAP']);
    });

    it('searches titles case-insensitively, only among the caller\'s boards, and combines with the filter', async () => {
      const hits = await http.get(`${PREFIX}/boards`).query({ q: ' roadmap ' }).set(auth(finder)).expect(200);
      expect(titles(hits.body)).toEqual(['Shared ROADMAP', 'Alpha Roadmap']);
      const both = await http
        .get(`${PREFIX}/boards`)
        .query({ q: 'roadmap', role: 'owned' })
        .set(auth(finder))
        .expect(200);
      expect(titles(both.body)).toEqual(['Alpha Roadmap']);
    });

    it('pages a filtered list with the same cursor scheme', async () => {
      const first = await http.get(`${PREFIX}/boards`).query({ q: 'roadmap', limit: 1 }).set(auth(finder)).expect(200);
      expect(titles(first.body)).toEqual(['Shared ROADMAP']);
      const second = await http
        .get(`${PREFIX}/boards`)
        .query({ q: 'roadmap', limit: 1, cursor: first.body.nextCursor as string })
        .set(auth(finder))
        .expect(200);
      expect(titles(second.body)).toEqual(['Alpha Roadmap']);
      expect(second.body.nextCursor).toBeNull();
    });

    it('rejects an unknown filter or an over-long search with 422', async () => {
      await http.get(`${PREFIX}/boards`).query({ role: 'everyone' }).set(auth(finder)).expect(422);
      await http.get(`${PREFIX}/boards`).query({ q: 'x'.repeat(121) }).set(auth(finder)).expect(422);
    });
  });

  describe('leaving and ownership transfer', () => {
    let boss: Account;
    let helper: Account;
    let watcher: Account;
    let outsider: Account;
    let board: string;
    const changes: BoardAccessChange[] = [];

    beforeAll(async () => {
      app.get(BoardAccessEvents).subscribe((c) => changes.push(c));
      boss = await seedUser('boss@syncflow.app');
      helper = await seedUser('helper@syncflow.app');
      watcher = await seedUser('watcher@syncflow.app');
      outsider = await seedUser('outsider@syncflow.app');
      const res = await http.post(`${PREFIX}/boards`).set(auth(boss)).send({ title: 'Team' }).expect(201);
      board = res.body.id as string;
      const joins: Array<[Account, 'editor' | 'viewer']> = [
        [helper, 'editor'],
        [watcher, 'viewer'],
      ];
      for (const [who, role] of joins) {
        await http
          .post(`${PREFIX}/boards/${board}/members`)
          .set(auth(boss))
          .send({ email: who.email, role })
          .expect(201);
      }
    });

    it('the owner cannot leave', async () => {
      const res = await http.delete(`${PREFIX}/boards/${board}/members/me`).set(auth(boss)).expect(409);
      expect(JSON.stringify(res.body)).toContain('Transfer ownership before leaving');
    });

    it('a non-member cannot leave', async () => {
      await http.delete(`${PREFIX}/boards/${board}/members/me`).set(auth(outsider)).expect(403);
    });

    it('a viewer leaves, drops live access, and revokes nothing else', async () => {
      await http
        .post(`${PREFIX}/boards/${board}/invites`)
        .set(auth(boss))
        .send({ kind: 'share_link', role: 'viewer' })
        .expect(201);
      changes.length = 0;
      await http.delete(`${PREFIX}/boards/${board}/members/me`).set(auth(watcher)).expect(204);
      expect(changes).toContainEqual({ boardId: board, userId: watcher.userId });
      await http.get(`${PREFIX}/boards/${board}`).set(auth(watcher)).expect(403);
      expect(await prisma.boardInvite.count({ where: { boardId: board } })).toBe(1);
      const members = await http.get(`${PREFIX}/boards/${board}/members`).set(auth(boss)).expect(200);
      expect(members.body.items.map((m: { userId: string }) => m.userId)).toEqual([boss.userId, helper.userId]);
    });

    it('rejects transfer to self (400), to a non-member (404), by a non-owner (403), bad id (422)', async () => {
      const url = `${PREFIX}/boards/${board}/transfer-ownership`;
      await http.post(url).set(auth(boss)).send({ userId: boss.userId }).expect(400);
      await http.post(url).set(auth(boss)).send({ userId: outsider.userId }).expect(404);
      await http.post(url).set(auth(helper)).send({ userId: helper.userId }).expect(403);
      await http.post(url).set(auth(boss)).send({ userId: 'not-a-uuid' }).expect(422);
      // A well-formed id of no user at all is the same 404, never a foreign-key 500.
      await http.post(url).set(auth(boss)).send({ userId: '99999999-9999-4999-8999-999999999999' }).expect(404);
      const unchanged = await http.get(`${PREFIX}/boards/${board}`).set(auth(boss)).expect(200);
      expect(unchanged.body).toMatchObject({ ownerId: boss.userId, role: 'owner' });
    });

    it("refuses to change or remove the owner's membership (403) and 404s a non-member", async () => {
      const ownerUrl = `${PREFIX}/boards/${board}/members/${boss.userId}`;
      await http.patch(ownerUrl).set(auth(boss)).send({ role: 'viewer' }).expect(403);
      await http.delete(ownerUrl).set(auth(boss)).expect(403);
      const strangerUrl = `${PREFIX}/boards/${board}/members/${outsider.userId}`;
      await http.patch(strangerUrl).set(auth(boss)).send({ role: 'viewer' }).expect(404);
      await http.delete(strangerUrl).set(auth(boss)).expect(404);
      const asOwner = await http.get(`${PREFIX}/boards/${board}`).set(auth(boss)).expect(200);
      expect(asOwner.body.role).toBe('owner');
    });

    it('transfers ownership: the target owns, the old owner becomes an editor', async () => {
      changes.length = 0;
      const res = await http
        .post(`${PREFIX}/boards/${board}/transfer-ownership`)
        .set(auth(boss))
        .send({ userId: helper.userId })
        .expect(200);
      expect(res.body).toMatchObject({ id: board, ownerId: helper.userId, role: 'editor', memberCount: 2 });
      expect(changes).toEqual(
        expect.arrayContaining([
          { boardId: board, userId: boss.userId },
          { boardId: board, userId: helper.userId },
        ]),
      );

      await http.patch(`${PREFIX}/boards/${board}`).set(auth(boss)).send({ title: 'mine' }).expect(403);
      await http.patch(`${PREFIX}/boards/${board}`).set(auth(helper)).send({ title: 'Ours' }).expect(200);
      const asNew = await http.get(`${PREFIX}/boards/${board}`).set(auth(helper)).expect(200);
      expect(asNew.body.role).toBe('owner');
      const asOld = await http.get(`${PREFIX}/boards/${board}`).set(auth(boss)).expect(200);
      expect(asOld.body.role).toBe('editor');

      // The former owner is now an ordinary member: they may leave, the new owner may not.
      await http.delete(`${PREFIX}/boards/${board}/members/me`).set(auth(helper)).expect(409);
      await http.delete(`${PREFIX}/boards/${board}/members/me`).set(auth(boss)).expect(204);
    });
  });
});
