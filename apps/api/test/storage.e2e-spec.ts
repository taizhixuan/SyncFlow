import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PREFIX = '/api/v1';

interface Account { token: string; userId: string; }

describe('Storage (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let owner: Account;
  let viewer: Account;
  let stranger: Account;
  let boardId: string;

  async function signup(email: string): Promise<Account> {
    const res = await http
      .post(`${PREFIX}/auth/signup`)
      .send({ email, password: 'storage-password', displayName: 'Storage User' })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id };
  }

  const auth = (a: Account) => ({ Authorization: `Bearer ${a.token}` });
  const valid = () => ({ boardId, fileName: 'photo.jpg', contentType: 'image/jpeg', size: 1024 });

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
    owner = await signup('storage@syncflow.app');
    viewer = await signup('storage-viewer@syncflow.app');
    stranger = await signup('storage-stranger@syncflow.app');

    const board = await http.post(`${PREFIX}/boards`).set(auth(owner)).send({ title: 'Assets' }).expect(201);
    boardId = board.body.id as string;
    await prisma.boardMember.create({ data: { boardId, userId: viewer.userId, role: 'viewer' } });
  });

  afterAll(async () => { await app.close(); });

  it('POST /storage/uploads as a board editor/owner → 201 scoped to the board', async () => {
    const res = await http.post(`${PREFIX}/storage/uploads`).set(auth(owner)).send(valid()).expect(201);
    expect(typeof res.body.uploadUrl).toBe('string');
    expect(res.body.uploadUrl.length).toBeGreaterThan(0);
    expect(res.body.assetUrl).toContain('syncflow-assets');
    expect(res.body.key).toMatch(new RegExp(`^boards/${boardId}/`));
  });

  it('signs the content length into the presigned URL', async () => {
    const res = await http.post(`${PREFIX}/storage/uploads`).set(auth(owner)).send(valid()).expect(201);
    const signed = new URL(res.body.uploadUrl as string).searchParams.get('X-Amz-SignedHeaders') ?? '';
    expect(signed.split(';')).toEqual(expect.arrayContaining(['content-length', 'content-type']));
  });

  it('unauthenticated → 401', async () => {
    await http.post(`${PREFIX}/storage/uploads`).send(valid()).expect(401);
  });

  it('missing boardId → 422', async () => {
    await http
      .post(`${PREFIX}/storage/uploads`)
      .set(auth(owner))
      .send({ fileName: 'photo.jpg', contentType: 'image/jpeg', size: 1024 })
      .expect(422);
  });

  it('non-member → 403 (no free hosting for arbitrary accounts)', async () => {
    await http.post(`${PREFIX}/storage/uploads`).set(auth(stranger)).send(valid()).expect(403);
  });

  it('viewer → 403 (read-only members cannot add assets)', async () => {
    await http.post(`${PREFIX}/storage/uploads`).set(auth(viewer)).send(valid()).expect(403);
  });

  it('non-image contentType → 422', async () => {
    await http
      .post(`${PREFIX}/storage/uploads`)
      .set(auth(owner))
      .send({ ...valid(), fileName: 'doc.pdf', contentType: 'application/pdf' })
      .expect(422);
  });

  it('SVG → 422 (scriptable; would be stored XSS on the bucket origin)', async () => {
    await http
      .post(`${PREFIX}/storage/uploads`)
      .set(auth(owner))
      .send({ ...valid(), fileName: 'x.svg', contentType: 'image/svg+xml' })
      .expect(422);
  });

  describe('POST /storage/avatar-uploads', () => {
    const avatar = { fileName: 'me.png', contentType: 'image/png', size: 2048 };

    it('scopes avatar uploads to the caller, with no board required', async () => {
      const res = await http.post(`${PREFIX}/storage/avatar-uploads`).set(auth(stranger)).send(avatar).expect(201);
      expect(res.body.key).toMatch(new RegExp(`^avatars/${stranger.userId}/`));
    });

    it('unauthenticated → 401', async () => {
      await http.post(`${PREFIX}/storage/avatar-uploads`).send(avatar).expect(401);
    });

    it('SVG → 422 and oversized avatar → 422', async () => {
      await http
        .post(`${PREFIX}/storage/avatar-uploads`)
        .set(auth(stranger))
        .send({ ...avatar, contentType: 'image/svg+xml' })
        .expect(422);
      await http
        .post(`${PREFIX}/storage/avatar-uploads`)
        .set(auth(stranger))
        .send({ ...avatar, size: 3 * 1024 * 1024 })
        .expect(422);
    });
  });

  it('oversized fileName → 422', async () => {
    await http
      .post(`${PREFIX}/storage/uploads`)
      .set(auth(owner))
      .send({ ...valid(), fileName: `${'a'.repeat(201)}.png` })
      .expect(422);
  });
});
