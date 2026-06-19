import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { TokenService } from './token.service';

function buildService(): TokenService {
  const config = {
    get: (key: string) =>
      key === 'jwt'
        ? {
            accessSecret: 'test-access-secret',
            refreshSecret: 'test-refresh-secret',
            accessTtl: 900,
            refreshTtl: 1209600,
          }
        : undefined,
  } as unknown as ConfigService<AppConfig, true>;
  return new TokenService(new JwtService({}), config);
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
