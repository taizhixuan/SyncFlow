import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

/** Mirrors @nestjs/throttler's ThrottlerStorageRecord (not exported from the package root). */
export interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Fixed-window counter + block flag, evaluated atomically in Redis so that
 * concurrent requests across instances can't both slip under the limit.
 * Returns [hits, hitsTtlMs, blocked(0|1), blockTtlMs].
 */
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or '0')
  return { hits, math.max(redis.call('PTTL', hitsKey), 0), 1, blockTtl }
end

local hits = redis.call('INCR', hitsKey)
local hitsTtl = redis.call('PTTL', hitsKey)
if hitsTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttl)
  hitsTtl = ttl
end

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  return { hits, hitsTtl, 1, blockDuration }
end
return { hits, hitsTtl, 0, 0 }
`;

const KEY_PREFIX = 'sf:throttle:';

/**
 * ThrottlerStorage backed by Redis so rate limits hold across every API
 * instance behind the load balancer (in-memory buckets would multiply the
 * effective limit by the instance count).
 *
 * Fails open (logged) if Redis is unreachable: /health/ready already reports
 * Redis down, and refusing all traffic would turn a cache blip into an outage.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  /** Takes a getter because the shared client is created in RedisService.onModuleInit. */
  constructor(private readonly client: () => Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const base = `${KEY_PREFIX}${throttlerName}:${key}`;
    try {
      const raw = (await this.client().eval(
        INCREMENT_SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
      const [totalHits, hitsTtlMs, blocked, blockTtlMs] = raw;
      return {
        totalHits,
        timeToExpire: Math.ceil(hitsTtlMs / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    } catch (err) {
      this.logger.error(`Rate-limit storage unavailable, allowing request: ${(err as Error).message}`);
      return { totalHits: 0, timeToExpire: Math.ceil(ttl / 1000), isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
