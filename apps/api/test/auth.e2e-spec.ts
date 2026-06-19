import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';

const PREFIX = '/api/v1';
const REFRESH_COOKIE = 'sf_refresh';

/** Extract the refresh-token value from a Set-Cookie header. */
function extractRefresh(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const header = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!header) throw new Error('no refresh cookie set');
  return header.split(';')[0]!.split('=')[1]!;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const user = { email: 'maya@syncflow.app', password: 'sup3r-secret-pw', displayName: 'Maya' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "users","refresh_tokens" RESTART IDENTITY CASCADE');

    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('signup', () => {
    it('rejects an invalid payload with 422', async () => {
      await http
        .post(`${PREFIX}/auth/signup`)
        .send({ email: 'not-an-email', password: 'short', displayName: '' })
        .expect(422);
    });

    it('creates a user, returns an access token + public user, and sets a refresh cookie', async () => {
      const res = await http.post(`${PREFIX}/auth/signup`).send(user).expect(201);

      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user.email).toBe(user.email);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(PRESENCE_PALETTE).toContain(res.body.user.color);

      const cookie = extractRefresh(res.headers['set-cookie']);
      expect(cookie.length).toBeGreaterThan(20);
    });

    it('rejects a duplicate email with 409', async () => {
      await http.post(`${PREFIX}/auth/signup`).send(user).expect(409);
    });
  });

  describe('login', () => {
    it('authenticates with correct credentials (200)', async () => {
      const res = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password })
        .expect(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(extractRefresh(res.headers['set-cookie']).length).toBeGreaterThan(20);
    });

    it('rejects a wrong password with 401', async () => {
      await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('protected route /users/me', () => {
    it('returns 401 without a token', async () => {
      await http.get(`${PREFIX}/users/me`).expect(401);
    });

    it('returns the current user with a valid token (200)', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const token = login.body.accessToken;

      const res = await http
        .get(`${PREFIX}/users/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.email).toBe(user.email);
    });
  });

  describe('refresh rotation + reuse detection', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);

      const refreshed = await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(200);

      expect(typeof refreshed.body.accessToken).toBe('string');
      const r2 = extractRefresh(refreshed.headers['set-cookie']);
      expect(r2).not.toBe(r1);
    });

    it('revokes the whole family when a rotated token is reused', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);

      // First use rotates r1 -> r2 (r1 is now spent).
      const rotated = await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(200);
      const r2 = extractRefresh(rotated.headers['set-cookie']);

      // Reusing the spent r1 is theft -> 401 and revokes the family.
      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(401);

      // r2 belonged to the now-revoked family -> also rejected.
      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r2}`)
        .expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token (204) and prevents further refresh', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);

      await http
        .post(`${PREFIX}/auth/logout`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(204);

      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(401);
    });
  });
});
