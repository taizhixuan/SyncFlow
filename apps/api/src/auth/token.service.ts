import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../config/configuration';
import { RedisService } from '../redis/redis.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/** Claims present on a verified access token (jti/exp are added at signing). */
export interface AccessTokenClaims extends AccessTokenPayload {
  jti?: string;
  exp?: number;
}

const DENYLIST_PREFIX = 'sf:auth:revoked-jti:';
const FAMILY_JTIS_PREFIX = 'sf:auth:family-jtis:';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly redis: RedisService,
  ) {}

  private get jwtConfig(): AppConfig['jwt'] {
    return this.config.get('jwt', { infer: true });
  }

  /** Sign an access token carrying a unique `jti`, so it can be revoked individually. */
  signAccessToken(payload: AccessTokenPayload): string {
    return this.signAccessTokenWithId(payload).token;
  }

  signAccessTokenWithId(payload: AccessTokenPayload): { token: string; jti: string; exp: number } {
    const { accessSecret, accessTtl } = this.jwtConfig;
    const jti = randomUUID();
    const token = this.jwt.sign(
      { sub: payload.sub, email: payload.email },
      { secret: accessSecret, expiresIn: accessTtl, jwtid: jti },
    );
    return { token, jti, exp: Math.floor(Date.now() / 1000) + accessTtl };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    return this.jwt.verify<AccessTokenClaims>(token, { secret: this.jwtConfig.accessSecret });
  }

  /**
   * Verify signature only. Used on logout, where an already-expired token needs
   * no denylisting but a forged one must never be trusted for its claims.
   */
  tryVerifyIgnoringExpiry(token: string): AccessTokenClaims | null {
    try {
      return this.jwt.verify<AccessTokenClaims>(token, {
        secret: this.jwtConfig.accessSecret,
        ignoreExpiration: true,
      });
    } catch {
      return null;
    }
  }

  /** Opaque, high-entropy refresh token + its stored SHA-256 hash. */
  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  get accessTtlSeconds(): number {
    return this.jwtConfig.accessTtl;
  }

  get refreshTtlSeconds(): number {
    return this.jwtConfig.refreshTtl;
  }

  /**
   * Denylist an access token until it would have expired anyway. Entries carry
   * a TTL, so the list never grows beyond the tokens still in circulation.
   */
  async revokeAccessToken(jti: string, exp: number): Promise<void> {
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;
    await this.redis.getClient().set(`${DENYLIST_PREFIX}${jti}`, '1', 'EX', ttl);
  }

  /**
   * True if the access token was revoked (logout / refresh-token theft). Shared
   * by the REST JwtStrategy and the WebSocket handshake.
   *
   * Fails open (logged) when Redis is unreachable: access tokens live 15 min,
   * and failing closed would log every user out during a Redis blip.
   */
  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    try {
      return (await this.redis.getClient().exists(`${DENYLIST_PREFIX}${jti}`)) === 1;
    } catch (err) {
      this.logger.error(`Access-token denylist lookup failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Remember which access tokens a refresh family minted, so that revoking the
   * family (reuse detection, logout) can also kill its live access tokens.
   */
  async trackFamilyAccessToken(familyId: string, jti: string, exp: number): Promise<void> {
    const key = `${FAMILY_JTIS_PREFIX}${familyId}`;
    await this.redis
      .getClient()
      .multi()
      .sadd(key, `${jti}:${exp}`)
      .expire(key, this.accessTtlSeconds)
      .exec();
  }

  async revokeFamilyAccessTokens(familyId: string): Promise<void> {
    const key = `${FAMILY_JTIS_PREFIX}${familyId}`;
    const client = this.redis.getClient();
    const members = await client.smembers(key);
    await Promise.all(
      members.map((member) => {
        const [jti, exp] = member.split(':');
        return jti && exp ? this.revokeAccessToken(jti, Number(exp)) : Promise.resolve();
      }),
    );
    await client.del(key);
  }
}
