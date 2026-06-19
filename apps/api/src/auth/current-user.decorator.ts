import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The authenticated principal attached to the request by JwtStrategy. */
export interface AuthUser {
  userId: string;
  email: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
});
