import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './auth.constants';

// The web app (Vercel) and the API (Render) are served from different sites in
// production, so the refresh cookie must be SameSite=None + Secure or the browser
// will refuse to send it on cross-site fetch()s — silently killing the session.
// Locally the web is same-origin via the Vite proxy (plain http), where Lax and
// non-Secure are correct.
describe('AuthController — refresh cookie cross-site policy', () => {
  const session = {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 900,
    user: { id: 'u1', email: 'e@x.com', displayName: 'E', color: '#fff' },
  };

  function controllerFor(nodeEnv: 'production' | 'development'): AuthController {
    const auth = { login: jest.fn().mockResolvedValue(session) } as unknown as AuthService;
    const config = {
      get: (key: string) => {
        if (key === 'nodeEnv') return nodeEnv;
        if (key === 'jwt') return { refreshTtl: 1_209_600 };
        return undefined;
      },
    } as unknown as ConfigService<unknown, true>;
    return new AuthController(auth, config);
  }

  function mockRes(): Response {
    return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
  }

  it('sets SameSite=None; Secure in production (cross-site)', async () => {
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await controllerFor('production').login({} as any, res);
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'none' }),
    );
  });

  it('sets SameSite=Lax and non-Secure in development (same-origin via proxy)', async () => {
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await controllerFor('development').login({} as any, res);
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh',
      expect.objectContaining({ secure: false, sameSite: 'lax' }),
    );
  });
});
