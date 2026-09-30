import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { E2E_REDIS_URL } from './env';

/** The slice of ioredis this file uses; ioredis is an API dependency, not a root one. */
interface RedisClient {
  scan(
    cursor: string,
    match: 'MATCH',
    pattern: string,
    count: 'COUNT',
    n: number,
  ): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}
type RedisCtor = new (
  url: string,
  opts: { lazyConnect?: boolean; maxRetriesPerRequest?: number },
) => RedisClient;

const requireFromApi = createRequire(path.resolve(__dirname, '../../apps/api/package.json'));

/**
 * Every browser request arrives through the Vite proxy from 127.0.0.1, so all
 * specs share one rate-limit bucket (signup: 10 per 10 minutes). Clearing the
 * suite's own Redis db keeps parallel, repeated runs from tripping it; it only
 * ever loosens limits for this isolated test API.
 */
export async function resetRateLimits(): Promise<void> {
  const Redis = requireFromApi('ioredis') as RedisCtor;
  const redis = new Redis(E2E_REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'sf:throttle:*', 'COUNT', 500);
      if (keys.length > 0) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  } finally {
    await redis.quit();
  }
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
}

/** A per-test unique identity, so specs stay independent and parallel-safe. */
export function newIdentity(prefix: string): {
  email: string;
  password: string;
  displayName: string;
} {
  const tag = randomUUID().slice(0, 8);
  return {
    email: `${prefix.toLowerCase()}-${tag}@e2e.syncflow.test`,
    password: `pw-${randomUUID()}`,
    displayName: `${prefix} ${tag}`,
  };
}

/**
 * Sign up through the real API using the browser context's own request
 * client: it shares the context's cookie jar, so the httpOnly refresh cookie
 * lands in the browser and the next page load restores the session exactly as
 * it would after a real signup.
 */
export async function signUpInContext(context: BrowserContext, prefix: string): Promise<TestUser> {
  await resetRateLimits();
  const identity = newIdentity(prefix);
  const res = await context.request.post('/api/v1/auth/signup', { data: identity });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { ...identity, id: body.user.id, accessToken: body.accessToken };
}

function auth(user: TestUser): Record<string, string> {
  return { Authorization: `Bearer ${user.accessToken}` };
}

export async function createBoard(
  request: APIRequestContext,
  owner: TestUser,
  title: string,
): Promise<string> {
  const res = await request.post('/api/v1/boards', { headers: auth(owner), data: { title } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Owner mints a share link and `member` accepts it — the API path of the invite flow. */
export async function shareBoard(
  request: APIRequestContext,
  owner: TestUser,
  member: TestUser,
  boardId: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  const created = await request.post(`/api/v1/boards/${boardId}/invites`, {
    headers: auth(owner),
    data: { kind: 'share_link', role },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { token } = (await created.json()) as { token: string };
  const accepted = await request.post(`/api/v1/invites/${token}/accept`, { headers: auth(member) });
  expect(accepted.ok(), await accepted.text()).toBe(true);
}
