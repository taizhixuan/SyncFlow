import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response, CookieOptions } from 'express';
import type { AuthResponse } from '@syncflow/shared';
import type { AppConfig } from '../config/configuration';
import { AuthService, type SessionResult } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.constants';

// Tighter throttle on credential endpoints (NFR-SEC-5).
const AUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Post('signup')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(await this.auth.signup(dto), res);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(await this.auth.login(dto), res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    return this.respondWithSession(await this.auth.refresh(presented), res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
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
