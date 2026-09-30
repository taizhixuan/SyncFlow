import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../config/configuration';
import { TokenService, type AccessTokenClaims } from './token.service';
import type { AuthUser } from './current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly tokens: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt', { infer: true }).accessSecret,
    });
  }

  async validate(payload: AccessTokenClaims): Promise<AuthUser> {
    // Tokens minted before jti was introduced carry none; they expire within
    // one access TTL of the deploy, so they are simply allowed to age out.
    if (payload.jti && (await this.tokens.isAccessTokenRevoked(payload.jti))) {
      throw new UnauthorizedException('Access token has been revoked');
    }
    return { userId: payload.sub, email: payload.email };
  }
}
