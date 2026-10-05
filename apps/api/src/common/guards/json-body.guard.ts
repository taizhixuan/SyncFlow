import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Second CSRF brake for routes that set the refresh cookie (signup, login).
 *
 * A cross-site HTML form can only send urlencoded, multipart or text/plain
 * bodies, and Nest's Express adapter happily parses urlencoded ones. Demanding
 * `application/json` means a forged form never reaches the handler, and a
 * cross-site `fetch` with a JSON body must pass a CORS preflight first.
 *
 * A request with no body at all is let through so validation can answer it
 * with the usual 422.
 */
@Injectable()
export class JsonBodyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.is('application/json') === false) {
      throw new UnsupportedMediaTypeException('Request body must be application/json');
    }
    return true;
  }
}
