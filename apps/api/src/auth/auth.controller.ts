import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response, CookieOptions } from 'express';
import type { AuthResponse } from '@syncflow/shared';
import type { AppConfig } from '../config/configuration';
import { JsonBodyGuard } from '../common/guards/json-body.guard';
import { TrustedOriginGuard } from '../common/guards/trusted-origin.guard';
import { ApiPublic, ApiRefreshCookie } from '../common/openapi/api-auth';
import { ApiErrors, ApiNoContent, ApiZodResponse } from '../common/openapi/api-responses';
import { AuthService, type ClientMeta, type SessionResult } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.constants';

// Tighter throttle on credential endpoints (NFR-SEC-5).
const AUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

// Signup answers 409 for a taken email (the UX needs it), which makes it an
// account-enumeration oracle; it also creates rows and burns argon2 time. It
// gets a much stricter per-IP budget than login to blunt both.
const SIGNUP_THROTTLE = { default: { limit: 10, ttl: 10 * 60_000 } };

function clientMeta(req: Request): ClientMeta {
  const userAgent = req.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: req.ip };
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Post('signup')
  @ApiPublic()
  @ApiOperation({ summary: 'Create an account' })
  @Throttle(SIGNUP_THROTTLE)
  @UseGuards(TrustedOriginGuard, JsonBodyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiZodResponse(HttpStatus.CREATED, 'AuthResponse', 'Account created; sets the refresh cookie')
  @ApiErrors(
    [403, 'Request origin is not allowed'],
    [409, 'Email already registered'],
    [415, 'Body is not application/json'],
    422,
    429,
  )
  async signup(
    @Body() dto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(await this.auth.signup(dto, clientMeta(req)), res);
  }

  @Post('login')
  @ApiPublic()
  @ApiOperation({ summary: 'Sign in with email and password' })
  @Throttle(AUTH_THROTTLE)
  @UseGuards(TrustedOriginGuard, JsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(HttpStatus.OK, 'AuthResponse', 'Signed in; sets the refresh cookie')
  @ApiErrors(
    [401, 'Invalid credentials'],
    [403, 'Request origin is not allowed'],
    [415, 'Body is not application/json'],
    422,
    429,
  )
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(await this.auth.login(dto, clientMeta(req)), res);
  }

  @Post('refresh')
  @ApiRefreshCookie()
  @ApiOperation({ summary: 'Rotate the refresh token for a new access token' })
  @UseGuards(TrustedOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(HttpStatus.OK, 'AuthResponse', 'New access token; rotates the refresh cookie')
  @ApiErrors(
    [401, 'Missing, invalid, expired or reused refresh token'],
    [403, 'Request origin is not allowed'],
    429,
  )
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    return this.respondWithSession(await this.auth.refresh(presented, clientMeta(req)), res);
  }

  @Post('logout')
  @ApiRefreshCookie()
  @ApiOperation({ summary: 'Sign out and revoke the session' })
  @UseGuards(TrustedOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent('Session revoked and refresh cookie cleared')
  @ApiErrors([403, 'Request origin is not allowed'], 429)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined, bearerToken(req));
    // Clear with the same attributes the cookie was set with, so the browser
    // matches and removes it (cross-site cookies need sameSite/secure to match).
    res.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
  }

  /**
   * Refresh-cookie attributes. In production the web app (Vercel) and API
   * (Render) are different sites, so the cookie must be SameSite=None + Secure
   * or the browser won't send it on cross-site fetch()s. Locally the web is
   * same-origin through the Vite proxy over http, where Lax + non-Secure works.
   */
  private refreshCookieOptions(): CookieOptions {
    const isProd = this.config.get('nodeEnv', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }

  private respondWithSession(session: SessionResult, res: Response): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.refreshCookieOptions(),
      maxAge: this.config.get('jwt', { infer: true }).refreshTtl * 1000,
    });
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }
}
