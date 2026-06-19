import { randomBytes, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../config/configuration';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get jwtConfig(): AppConfig['jwt'] {
    return this.config.get('jwt', { infer: true });
  }

  signAccessToken(payload: AccessTokenPayload): string {
    const { accessSecret, accessTtl } = this.jwtConfig;
    return this.jwt.sign(payload, { secret: accessSecret, expiresIn: accessTtl });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, { secret: this.jwtConfig.accessSecret });
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
}
