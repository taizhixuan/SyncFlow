import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Authenticates a request via the Bearer access token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
