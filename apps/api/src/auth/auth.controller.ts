import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
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
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private respondWithSession(session: SessionResult, res: Response): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.get('nodeEnv', { infer: true }) === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.config.get('jwt', { infer: true }).refreshTtl * 1000,
    });
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }
}
