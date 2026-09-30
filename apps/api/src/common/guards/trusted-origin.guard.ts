import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration';

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF brake for routes authenticated by a cookie alone (refresh, logout).
 *
 * In production the refresh cookie is SameSite=None (web and API are on
 * different sites), so the browser attaches it to requests forged by any page.
 * Browsers always send `Origin` on cross-site POSTs (falling back to `Referer`
 * in older engines), so a foreign or opaque (`null`) origin is rejected.
 *
 * A request with neither header cannot have come from a browser page the user
 * visited, so it is allowed — that keeps curl, native clients and tests working
 * without weakening the browser threat model this guard exists for.
 */
@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    let presented: string | null;
    if (typeof origin === 'string') {
      presented = originOf(origin);
    } else if (typeof referer === 'string') {
      presented = originOf(referer);
    } else {
      return true;
    }

    const allowed = this.config.get('webOrigins', { infer: true });
    if (presented && allowed.includes(presented)) return true;
    throw new ForbiddenException('Request origin is not allowed');
  }
}
