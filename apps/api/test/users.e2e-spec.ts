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
}

describe('Users (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let account: Account;

  async function signup(email: string, displayName = 'Test User'): Promise<Account> {
    const res = await http
      .post(`${PREFIX}/auth/signup`)
      .send({ email, password: 'p@ssw0rdX1!', displayName })
      .expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string };
  }

  const authHeader = (a: Account): Record<string, string> => ({
    Authorization: `Bearer ${a.token}`,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "users","refresh_tokens" RESTART IDENTITY CASCADE',
    );

    http = request(app.getHttpServer());
    account = await signup('profile@syncflow.app', 'ProfileUser');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /users/me', () => {
    it('returns 401 when unauthenticated', async () => {
      await http.patch(`${PREFIX}/users/me`).send({ displayName: 'New' }).expect(401);
    });

    it('updates displayName and returns updated public user', async () => {
      const res = await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ displayName: 'Updated Name' })
        .expect(200);

      expect(res.body.displayName).toBe('Updated Name');
      expect(res.body.email).toBe('profile@syncflow.app');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('updates color with a valid hex value', async () => {
      const res = await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ color: '#AABBCC' })
        .expect(200);

      expect(res.body.color).toBe('#AABBCC');
    });

    it('updates avatarUrl', async () => {
      const url = 'https://example.com/avatar.jpg';
      const res = await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ avatarUrl: url })
        .expect(200);

      expect(res.body.avatarUrl).toBe(url);
    });

    it('clears avatarUrl when null is passed', async () => {
      // First set one
      await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ avatarUrl: 'https://example.com/avatar.jpg' })
        .expect(200);

      // Then clear it
      const res = await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ avatarUrl: null })
        .expect(200);

      expect(res.body.avatarUrl).toBeNull();
    });

    it('rejects an invalid color with 422', async () => {
      await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ color: 'not-a-hex-color' })
        .expect(422);
    });

    it('rejects an empty displayName with 422', async () => {
      await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ displayName: '' })
        .expect(422);
    });

    it('GET /users/me reflects changes after PATCH', async () => {
      await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({ displayName: 'FinalName', color: '#112233' })
        .expect(200);

      const res = await http
        .get(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .expect(200);

      expect(res.body.displayName).toBe('FinalName');
      expect(res.body.color).toBe('#112233');
    });

    it('allows an empty body (no-op update)', async () => {
      const before = await http
        .get(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .expect(200);

      const res = await http
        .patch(`${PREFIX}/users/me`)
        .set(authHeader(account))
        .send({})
        .expect(200);

      expect(res.body.displayName).toBe(before.body.displayName);
    });
  });
});
