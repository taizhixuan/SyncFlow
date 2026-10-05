import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PRESENCE_PALETTE } from '@syncflow/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { RedisService } from '../src/redis/redis.service';
import { RedisThrottlerStorage } from '../src/common/throttler/redis-throttler.storage';

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

  /** Backdate when the presented (already spent) token was rotated, past the grace window. */
  async function pushOutOfGrace(presented: string): Promise<void> {
    const prisma = app.get(PrismaService);
    const tokens = app.get(TokenService);
    await prisma.refreshToken.update({
      where: { tokenHash: tokens.hashRefreshToken(presented) },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
  }

  describe('signup', () => {
    it('rejects an invalid payload with 422', async () => {
      await http
        .post(`${PREFIX}/auth/signup`)
        .send({ email: 'not-an-email', password: 'short', displayName: '' })
        .expect(422);
    });

    it('rejects a whitespace-only displayName with 422 (trimmed like a profile edit)', async () => {
      await http
        .post(`${PREFIX}/auth/signup`)
        .send({ email: 'blank-name@syncflow.app', password: 'long-enough-pw', displayName: '   ' })
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

    it('revokes the whole family when a rotated token is reused after the grace window', async () => {
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
      const accessFromR2 = rotated.body.accessToken as string;
      await pushOutOfGrace(r1);

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

      // Access tokens minted for the stolen family are denylisted immediately
      // rather than staying valid until they expire.
      await http
        .get(`${PREFIX}/users/me`)
        .set('Authorization', `Bearer ${accessFromR2}`)
        .expect(401);
    });

    it('a token spent long ago is theft even if replayed just after a later rotation', async () => {
      // The grace window belongs to the presented token's own rotation. Measuring
      // it from the family's newest token would let a long-stolen token in
      // whenever the real user happened to refresh in the last few seconds.
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);
      const first = await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(200);
      const r2 = extractRefresh(first.headers['set-cookie']);
      await pushOutOfGrace(r1);

      // The legitimate tab rotates again: the family now has a brand-new token.
      const second = await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r2}`)
        .expect(200);
      const r3 = extractRefresh(second.headers['set-cookie']);

      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(401);
      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r3}`)
        .expect(401);
    });

    it('re-presenting a just-rotated token inside the grace window keeps the session alive', async () => {
      // Two tabs cold-loading together both send the same cookie; the loser of
      // the race must not be mistaken for a thief and log the user out.
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);

      const first = await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(200);
      const r2 = extractRefresh(first.headers['set-cookie']);

      const second = await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(200);
      const sibling = extractRefresh(second.headers['set-cookie']);
      expect(sibling).not.toBe(r2);

      // Both descendants remain usable — the family was not revoked.
      await http.post(`${PREFIX}/auth/refresh`).set('Cookie', `${REFRESH_COOKIE}=${r2}`).expect(200);
      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Cookie', `${REFRESH_COOKIE}=${sibling}`)
        .expect(200);
    });

    it('concurrent refreshes with one token all succeed and leave exactly one claim', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);
      const prisma = app.get(PrismaService);
      const tokens = app.get(TokenService);
      const record = await prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: tokens.hashRefreshToken(r1) },
      });

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          http.post(`${PREFIX}/auth/refresh`).set('Cookie', `${REFRESH_COOKIE}=${r1}`),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);

      // r1 is spent; each response carries its own live descendant.
      const family = await prisma.refreshToken.findMany({ where: { familyId: record.familyId } });
      expect(family.find((t) => t.id === record.id)?.revoked).toBe(true);
      expect(family.filter((t) => !t.revoked)).toHaveLength(5);
      for (const res of results) {
        const next = extractRefresh(res.headers['set-cookie']);
        await http
          .post(`${PREFIX}/auth/refresh`)
          .set('Cookie', `${REFRESH_COOKIE}=${next}`)
          .expect(200);
      }
    });

    it('records the client user-agent and ip on issued refresh tokens', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .set('User-Agent', 'syncflow-e2e-agent')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const r1 = extractRefresh(login.headers['set-cookie']);
      const tokens = app.get(TokenService);
      const row = await app.get(PrismaService).refreshToken.findUniqueOrThrow({
        where: { tokenHash: tokens.hashRefreshToken(r1) },
      });
      expect(row.userAgent).toBe('syncflow-e2e-agent');
      expect(row.ip).toBeTruthy();
    });
  });

  describe('CSRF origin check on cookie-authenticated routes', () => {
    it('rejects refresh/logout from a foreign Origin or Referer (403)', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);

      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Origin', 'https://evil.example')
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(403);
      await http
        .post(`${PREFIX}/auth/logout`)
        .set('Referer', 'https://evil.example/page')
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(403);

      // The cookie survived both forged attempts and still works from the app.
      await http
        .post(`${PREFIX}/auth/refresh`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(200);
    });

    it('rejects a login or signup forged from a foreign page (login CSRF)', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .set('Origin', 'https://evil.example')
        .send({ email: user.email, password: user.password })
        .expect(403);
      expect(login.headers['set-cookie']).toBeUndefined();

      await http
        .post(`${PREFIX}/auth/signup`)
        .set('Origin', 'https://evil.example')
        .send({ email: 'csrf@syncflow.app', password: 'csrf-password', displayName: 'Csrf' })
        .expect(403);

      await http
        .post(`${PREFIX}/auth/login`)
        .set('Origin', 'http://localhost:5173')
        .send({ email: user.email, password: user.password })
        .expect(200);
    });

    it('rejects a form-encoded login, the body a cross-site form would send (415)', async () => {
      const res = await http
        .post(`${PREFIX}/auth/login`)
        .type('form')
        .send({ email: user.email, password: user.password })
        .expect(415);
      expect(res.headers['set-cookie']).toBeUndefined();
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

    it('denylists the access token so it stops working before it expires', async () => {
      const login = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: user.password });
      const r1 = extractRefresh(login.headers['set-cookie']);
      const access = login.body.accessToken as string;
      await http.get(`${PREFIX}/users/me`).set('Authorization', `Bearer ${access}`).expect(200);

      await http
        .post(`${PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${access}`)
        .set('Cookie', `${REFRESH_COOKIE}=${r1}`)
        .expect(204);

      await http.get(`${PREFIX}/users/me`).set('Authorization', `Bearer ${access}`).expect(401);
    });
  });

  describe('error envelope', () => {
    it('shapes errors as { statusCode, error, message, requestId } and echoes x-request-id', async () => {
      const res = await http
        .get(`${PREFIX}/users/me`)
        .set('x-request-id', 'e2e-req-42')
        .expect(401);
      expect(res.headers['x-request-id']).toBe('e2e-req-42');
      expect(res.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized',
        requestId: 'e2e-req-42',
      });
    });

    it('generates a request id when the caller sends none', async () => {
      const res = await http.get(`${PREFIX}/users/me`).expect(401);
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });
  });

  describe('security headers', () => {
    it('sets helmet headers on API responses', async () => {
      const res = await http.get(`${PREFIX}/health/live`).expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('input hardening', () => {
    it('rejects an oversized login password with 422 before hashing it', async () => {
      await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: 'x'.repeat(201) })
        .expect(422);
    });

    it('answers an oversized body with 413, not a 500', async () => {
      const res = await http
        .post(`${PREFIX}/auth/login`)
        .send({ email: user.email, password: 'x'.repeat(200_000) })
        .expect(413);
      expect(res.body).toMatchObject({ statusCode: 413, error: 'Payload Too Large' });
    });

    it('concurrent signups for one email yield one 201 and 409s, never a 500', async () => {
      const email = `race-${Date.now()}@syncflow.app`;
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          http
            .post(`${PREFIX}/auth/signup`)
            .send({ email, password: 'race-password', displayName: 'Race' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });
  });

  describe('Redis throttler storage (shared across instances)', () => {
    it('counts hits atomically across two storages and blocks past the limit', async () => {
      const client = (): ReturnType<RedisService['getClient']> => app.get(RedisService).getClient();
      // Two storages over one Redis model two API instances.
      const a = new RedisThrottlerStorage(client);
      const b = new RedisThrottlerStorage(client);
      const key = `e2e-${Date.now()}-${Math.random()}`;

      const hits = await Promise.all([
        a.increment(key, 60_000, 3, 60_000, 'default'),
        b.increment(key, 60_000, 3, 60_000, 'default'),
        a.increment(key, 60_000, 3, 60_000, 'default'),
      ]);
      expect(hits.map((h) => h.totalHits).sort()).toEqual([1, 2, 3]);
      expect(hits.every((h) => !h.isBlocked)).toBe(true);

      const over = await b.increment(key, 60_000, 3, 60_000, 'default');
      expect(over.isBlocked).toBe(true);
      expect(over.timeToBlockExpire).toBeGreaterThan(0);
      expect((await a.increment(key, 60_000, 3, 60_000, 'default')).isBlocked).toBe(true);
    });
  });

  // Runs last: it deliberately exhausts this app instance's signup bucket.
  describe('signup throttle', () => {
    it('limits signup harder than login (abuse + enumeration brake)', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const res = await http.post(`${PREFIX}/auth/signup`).send({
          email: `bulk-${i}-${Date.now()}@syncflow.app`,
          password: 'bulk-password',
          displayName: 'Bulk',
        });
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
    });
  });
});
