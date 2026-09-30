import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, createHash } from 'node:crypto';
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

describe('Invites (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  async function signup(email: string): Promise<Account> {
    const res = await http
      .post(`${PREFIX}/auth/signup`)
      .send({ email, password: 'invite-pw-123', displayName: email.split('@')[0] })
      .expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string, email };
  }

  const auth = (a: Account): { Authorization: string } => ({ Authorization: `Bearer ${a.token}` });

  let owner: Account;
  let editor: Account;
  let stranger: Account;
  let boardId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "users","boards","board_members","board_invites","refresh_tokens" RESTART IDENTITY CASCADE',
    );
    http = request(app.getHttpServer());
    owner = await signup('invite-owner@syncflow.app');
    editor = await signup('invite-editor@syncflow.app');
    stranger = await signup('invite-stranger@syncflow.app');

    // Create a board owned by owner
    const res = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Invite Test Board' }).expect(201);
    boardId = res.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /boards/:id/invites', () => {
    it('non-owner gets 403', async () => {
      // stranger is not a member, so 403
      await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(stranger))
        .send({ kind: 'share_link', role: 'editor' })
        .expect(403);
    });

    it('owner creates a share_link invite', async () => {
      const res = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'editor' })
        .expect(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.inviteUrl).toContain(res.body.token);
      expect(res.body.role).toBe('editor');
      expect(res.body.kind).toBe('share_link');
      expect(res.body.expiresAt).toBeDefined();
    });

    it('owner creates an email invite', async () => {
      const res = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'email', role: 'viewer', email: editor.email })
        .expect(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.role).toBe('viewer');
      expect(res.body.kind).toBe('email');
    });

    it('rejects email invite without email field', async () => {
      // GlobalValidationPipe is configured with errorHttpStatusCode: 422
      await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'email', role: 'editor' })
        .expect(422);
    });

    it('rejects invalid role (owner)', async () => {
      await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'owner' })
        .expect(422);
    });
  });

  describe('GET /invites/:token (preview)', () => {
    let shareToken: string;
    let emailToken: string;

    beforeAll(async () => {
      const r1 = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'editor' })
        .expect(201);
      shareToken = r1.body.token as string;

      const r2 = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'email', role: 'viewer', email: 'preview@syncflow.app' })
        .expect(201);
      emailToken = r2.body.token as string;
    });

    it('returns valid preview for a good share_link token', async () => {
      const res = await http.get(`${PREFIX}/invites/${shareToken}`).expect(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.boardTitle).toBe('Invite Test Board');
      expect(res.body.role).toBe('editor');
      expect(res.body.kind).toBe('share_link');
    });

    it('returns valid preview for a good email token', async () => {
      const res = await http.get(`${PREFIX}/invites/${emailToken}`).expect(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.role).toBe('viewer');
      expect(res.body.kind).toBe('email');
    });

    it('returns {valid:false} for a bogus token', async () => {
      const res = await http.get(`${PREFIX}/invites/totally-bogus-token-xyz`).expect(200);
      expect(res.body.valid).toBe(false);
    });
  });

  describe('POST /invites/:token/accept (share_link — reusable)', () => {
    let linkToken: string;

    beforeAll(async () => {
      const res = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'editor' })
        .expect(201);
      linkToken = res.body.token as string;
    });

    it('requires auth — 401 without token', async () => {
      await http.post(`${PREFIX}/invites/${linkToken}/accept`).expect(401);
    });

    it('stranger accepts a share_link invite and becomes a member', async () => {
      const res = await http.post(`${PREFIX}/invites/${linkToken}/accept`).set(auth(stranger)).expect(201);
      expect(res.body.boardId).toBe(boardId);
      expect(res.body.role).toBe('editor');
    });

    it('same user accepting again is idempotent (does not downgrade)', async () => {
      const res = await http.post(`${PREFIX}/invites/${linkToken}/accept`).set(auth(stranger)).expect(201);
      expect(res.body.role).toBe('editor');
    });

    it('another user accepts the same share_link (reusable)', async () => {
      const anotherUser = await signup('another@syncflow.app');
      const res = await http.post(`${PREFIX}/invites/${linkToken}/accept`).set(auth(anotherUser)).expect(201);
      expect(res.body.boardId).toBe(boardId);
      expect(res.body.role).toBe('editor');
    });
  });

  describe('POST /invites/:token/accept (email — single-use)', () => {
    let emailToken: string;

    beforeAll(async () => {
      const res = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'email', role: 'viewer', email: editor.email })
        .expect(201);
      emailToken = res.body.token as string;
    });

    it('wrong-email user is rejected with 403', async () => {
      await http.post(`${PREFIX}/invites/${emailToken}/accept`).set(auth(stranger)).expect(403);
    });

    it('correct-email user accepts and becomes a member', async () => {
      const res = await http.post(`${PREFIX}/invites/${emailToken}/accept`).set(auth(editor)).expect(201);
      expect(res.body.boardId).toBe(boardId);
      expect(res.body.role).toBe('viewer');
    });

    it('second accept of email invite is rejected (single-use) with 410', async () => {
      await http.post(`${PREFIX}/invites/${emailToken}/accept`).set(auth(editor)).expect(410);
    });
  });

  describe('GET /boards/:id/invites (list)', () => {
    it('owner can list active invites', async () => {
      const res = await http.get(`${PREFIX}/boards/${boardId}/invites`).set(auth(owner)).expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.nextCursor).toBeNull();
      // token/tokenHash must NOT appear
      for (const invite of res.body.items as Record<string, unknown>[]) {
        expect(invite['token']).toBeUndefined();
        expect(invite['tokenHash']).toBeUndefined();
        expect(invite['id']).toBeDefined();
        expect(invite['kind']).toBeDefined();
        expect(invite['role']).toBeDefined();
      }
    });

    it('non-owner gets 403', async () => {
      await http.get(`${PREFIX}/boards/${boardId}/invites`).set(auth(editor)).expect(403);
    });

    it('pages newest first, chains nextCursor, and ends with null', async () => {
      const board = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Paged' }).expect(201);
      const paged = board.body.id as string;
      const url = `${PREFIX}/boards/${paged}/invites`;
      const prisma = app.get(PrismaService);
      for (let i = 0; i < 3; i += 1) {
        await http.post(url).set(auth(owner)).send({ kind: 'share_link', role: 'viewer' }).expect(201);
      }
      // Distinct creation times so the expected order never hinges on a same-millisecond tie.
      const rows = await prisma.boardInvite.findMany({ where: { boardId: paged }, orderBy: { id: 'asc' } });
      for (const [i, row] of rows.entries()) {
        await prisma.boardInvite.update({
          where: { id: row.id },
          data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) },
        });
      }
      const newestFirst = [...rows].reverse().map((r) => r.id);

      const first = await http.get(url).query({ limit: 2 }).set(auth(owner)).expect(200);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await http
        .get(url)
        .query({ limit: 2, cursor: first.body.nextCursor as string })
        .set(auth(owner))
        .expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.nextCursor).toBeNull();
      const ids = [...first.body.items, ...second.body.items].map((i: { id: string }) => i.id);
      expect(ids).toEqual(newestFirst);

      await http.get(url).query({ cursor: 'bogus' }).set(auth(owner)).expect(400);
      await http.get(url).query({ limit: 500 }).set(auth(owner)).expect(422);
    });
  });

  describe('DELETE /boards/:id/invites/:inviteId (revoke)', () => {
    let revokeToken: string;
    let revokeInviteId: string;

    beforeAll(async () => {
      const res = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'viewer' })
        .expect(201);
      revokeToken = res.body.token as string;

      // Get the invite id via list
      const listRes = await http.get(`${PREFIX}/boards/${boardId}/invites`).set(auth(owner)).expect(200);
      const invites = listRes.body.items as Array<{ id: string; kind: string; role: string }>;
      const found = invites.find((i) => i.kind === 'share_link' && i.role === 'viewer');
      revokeInviteId = found!.id;
    });

    it('owner revokes an invite', async () => {
      await http.delete(`${PREFIX}/boards/${boardId}/invites/${revokeInviteId}`).set(auth(owner)).expect(204);
    });

    it('revoked token no longer valid for accept', async () => {
      const newUser = await signup('revoke-test@syncflow.app');
      await http.post(`${PREFIX}/invites/${revokeToken}/accept`).set(auth(newUser)).expect(404);
    });

    it('an editor (not just a viewer) cannot revoke', async () => {
      // `editor` above joined as a viewer; mint a genuine editor so this really
      // exercises the owner-only rule rather than a viewer rejection.
      const link = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'editor' })
        .expect(201);
      const realEditor = await signup('invite-real-editor@syncflow.app');
      const joined = await http
        .post(`${PREFIX}/invites/${link.body.token as string}/accept`)
        .set(auth(realEditor))
        .expect(201);
      expect(joined.body.role).toBe('editor');

      const listRes = await http.get(`${PREFIX}/boards/${boardId}/invites`).set(auth(owner)).expect(200);
      const invites = listRes.body.items as Array<{ id: string }>;
      const someId = invites[invites.length - 1]!.id;
      await http.delete(`${PREFIX}/boards/${boardId}/invites/${someId}`).set(auth(realEditor)).expect(403);
    });

    it('malformed ids → 400, not 500', async () => {
      await http.get(`${PREFIX}/boards/not-a-uuid/invites`).set(auth(owner)).expect(400);
      await http.delete(`${PREFIX}/boards/${boardId}/invites/not-a-uuid`).set(auth(owner)).expect(400);
    });
  });

  describe('hardening', () => {
    it('matches email invites case-insensitively (emails are stored lowercased)', async () => {
      const invite = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'email', role: 'viewer', email: 'Invite-Mixed@SyncFlow.App' })
        .expect(201);
      const invitee = await signup('invite-mixed@syncflow.app');
      await http
        .post(`${PREFIX}/invites/${invite.body.token as string}/accept`)
        .set(auth(invitee))
        .expect(201);
    });

    it('caps expiresInHours at 720 (30 days)', async () => {
      await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'viewer', expiresInHours: 1e12 })
        .expect(422);
      await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'viewer', expiresInHours: 720 })
        .expect(201);
    });

    it('invites to a soft-deleted board neither preview nor accept', async () => {
      const board = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Doomed' }).expect(201);
      const link = await http
        .post(`${PREFIX}/boards/${board.body.id as string}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'editor' })
        .expect(201);
      await app
        .get(PrismaService)
        .board.update({ where: { id: board.body.id as string }, data: { deletedAt: new Date() } });

      const preview = await http.get(`${PREFIX}/invites/${link.body.token as string}`).expect(200);
      expect(preview.body.valid).toBe(false);
      await http
        .post(`${PREFIX}/invites/${link.body.token as string}/accept`)
        .set(auth(stranger))
        .expect(404);
    });

    it('concurrent accepts of one share link are idempotent (no 500 on the unique index)', async () => {
      const link = await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'viewer' })
        .expect(201);
      const joiner = await signup('invite-concurrent@syncflow.app');
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          http.post(`${PREFIX}/invites/${link.body.token as string}/accept`).set(auth(joiner)),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      const rows = await app
        .get(PrismaService)
        .boardMember.count({ where: { boardId, userId: joiner.userId } });
      expect(rows).toBe(1);
    });

    it('concurrent accepts of one email invite admit the invitee once', async () => {
      const board = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Race' }).expect(201);
      const race = board.body.id as string;
      const invite = await http
        .post(`${PREFIX}/boards/${race}/invites`)
        .set(auth(owner))
        .send({ kind: 'email', role: 'editor', email: 'invite-concurrent@syncflow.app' })
        .expect(201);
      const joiner = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: 'invite-concurrent@syncflow.app', password: 'invite-pw-123' })
        .expect(200);
      const bearer = { Authorization: `Bearer ${joiner.body.accessToken as string}` };

      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          http.post(`${PREFIX}/invites/${invite.body.token as string}/accept`).set(bearer),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses).toContain(201);
      expect(statuses.every((s) => s === 201 || s === 410)).toBe(true);
      const prisma = app.get(PrismaService);
      expect(await prisma.boardMember.count({ where: { boardId: race } })).toBe(2); // owner + invitee
    });
  });

  describe('Expired invite', () => {
    it('expired invite is rejected on accept', async () => {
      const prisma = app.get(PrismaService);
      const rawToken = randomBytes(48).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      await prisma.boardInvite.create({
        data: {
          boardId,
          tokenHash,
          role: 'editor',
          kind: 'share_link',
          expiresAt: new Date(Date.now() - 1000), // already expired
          createdBy: owner.userId,
        },
      });

      const newUser = await signup('expired-test@syncflow.app');
      await http.post(`${PREFIX}/invites/${rawToken}/accept`).set(auth(newUser)).expect(410);
    });
  });
});
