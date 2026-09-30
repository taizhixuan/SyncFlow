import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import type { RedisService } from '../redis/redis.service';
import { TokenService } from './token.service';

/** Just enough of ioredis for the denylist: string keys with TTLs and sets. */
class FakeRedis {
  readonly strings = new Map<string, { value: string; ttl: number }>();
  readonly sets = new Map<string, Set<string>>();
  failing = false;

  async set(key: string, value: string, _ex: 'EX', ttl: number): Promise<'OK'> {
    this.strings.set(key, { value, ttl });
    return 'OK';
  }

  async exists(key: string): Promise<number> {
    if (this.failing) throw new Error('connection refused');
    return this.strings.has(key) ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async del(key: string): Promise<number> {
    return this.sets.delete(key) ? 1 : 0;
  }

  multi(): { sadd: (k: string, m: string) => unknown; expire: () => unknown; exec: () => Promise<[]> } {
    const chain = {
      sadd: (key: string, member: string) => {
        const set = this.sets.get(key) ?? new Set<string>();
        set.add(member);
        this.sets.set(key, set);
        return chain;
      },
      expire: () => chain,
      exec: async (): Promise<[]> => [],
    };
    return chain;
  }
}

function buildService(redis = new FakeRedis()): TokenService {
  const config = {
    get: (key: string) =>
      key === 'jwt'
        ? { accessSecret: 'test-access-secret', accessTtl: 900, refreshTtl: 1209600 }
        : undefined,
  } as unknown as ConfigService<AppConfig, true>;
  const redisService = { getClient: () => redis } as unknown as RedisService;
  return new TokenService(new JwtService({}), config, redisService);
}

describe('TokenService', () => {
  const service = buildService();

  it('signs an access token that verifies back to its payload', () => {
    const token = service.signAccessToken({ sub: 'user-1', email: 'a@b.com' });
    expect(typeof token).toBe('string');
    const payload = service.verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
  });

  it('gives every access token a unique jti so it can be revoked on its own', () => {
    const a = service.verifyAccessToken(service.signAccessToken({ sub: 'u', email: 'a@b.com' }));
    const b = service.verifyAccessToken(service.signAccessToken({ sub: 'u', email: 'a@b.com' }));
    expect(a.jti).toEqual(expect.any(String));
    expect(a.jti).not.toBe(b.jti);
  });

  it('rejects a tampered access token', () => {
    const token = service.signAccessToken({ sub: 'user-1', email: 'a@b.com' });
    expect(() => service.verifyAccessToken(`${token}tampered`)).toThrow();
  });

  it('generates a refresh token whose hash matches and differs from the token', () => {
    const { token, tokenHash } = service.generateRefreshToken();
    expect(tokenHash).not.toBe(token);
    expect(service.hashRefreshToken(token)).toBe(tokenHash);
  });

  it('generates unique refresh tokens', () => {
    expect(service.generateRefreshToken().token).not.toBe(service.generateRefreshToken().token);
  });
});

describe('TokenService — access-token denylist', () => {
  it('denylists a jti for exactly its remaining lifetime', async () => {
    const redis = new FakeRedis();
    const service = buildService(redis);
    const exp = Math.floor(Date.now() / 1000) + 120;
    await service.revokeAccessToken('jti-1', exp);
    expect(await service.isAccessTokenRevoked('jti-1')).toBe(true);
    expect(await service.isAccessTokenRevoked('jti-2')).toBe(false);
    const ttl = [...redis.strings.values()][0]?.ttl ?? 0;
    expect(ttl).toBeGreaterThan(115);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('skips already-expired tokens', async () => {
    const redis = new FakeRedis();
    await buildService(redis).revokeAccessToken('old', Math.floor(Date.now() / 1000) - 5);
    expect(redis.strings.size).toBe(0);
  });

  it('revokes every access token a refresh family minted', async () => {
    const service = buildService();
    const exp = Math.floor(Date.now() / 1000) + 900;
    await service.trackFamilyAccessToken('fam', 'a', exp);
    await service.trackFamilyAccessToken('fam', 'b', exp);
    await service.revokeFamilyAccessTokens('fam');
    expect(await service.isAccessTokenRevoked('a')).toBe(true);
    expect(await service.isAccessTokenRevoked('b')).toBe(true);
  });

  it('fails open when Redis is unreachable', async () => {
    const redis = new FakeRedis();
    redis.failing = true;
    expect(await buildService(redis).isAccessTokenRevoked('x')).toBe(false);
  });
});
