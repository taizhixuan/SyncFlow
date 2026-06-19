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
      expect(Array.isArray(res.body)).toBe(true);
      // token/tokenHash must NOT appear
      for (const invite of res.body as Record<string, unknown>[]) {
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
      const invites = listRes.body as Array<{ id: string; kind: string; role: string }>;
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

    it('non-owner cannot revoke', async () => {
      // create another invite to try to revoke
      await http
        .post(`${PREFIX}/boards/${boardId}/invites`)
        .set(auth(owner))
        .send({ kind: 'share_link', role: 'viewer' })
        .expect(201);
      const listRes = await http.get(`${PREFIX}/boards/${boardId}/invites`).set(auth(owner)).expect(200);
      const invites = listRes.body as Array<{ id: string }>;
      const someId = invites[invites.length - 1]!.id;
      await http.delete(`${PREFIX}/boards/${boardId}/invites/${someId}`).set(auth(editor)).expect(403);
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
