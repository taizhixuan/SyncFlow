import { ApiBearerAuth, ApiCookieAuth, ApiSecurity } from '@nestjs/swagger';

/** Security scheme names registered on the document in swagger.ts. */
export const ACCESS_TOKEN_SCHEME = 'access-token';
export const REFRESH_COOKIE_SCHEME = 'refresh-cookie';

/** Route requires `Authorization: Bearer <access token>` (JwtAuthGuard). */
export const ApiAccessToken = (): MethodDecorator & ClassDecorator =>
  ApiBearerAuth(ACCESS_TOKEN_SCHEME);

/** Route reads the httpOnly refresh-token cookie. */
export const ApiRefreshCookie = (): MethodDecorator & ClassDecorator =>
  ApiCookieAuth(REFRESH_COOKIE_SCHEME);

/**
 * Route needs no credentials. An empty security requirement is OpenAPI's way
 * of saying so explicitly, rather than leaving security undeclared.
 */
export const ApiPublic = (): MethodDecorator & ClassDecorator => ApiSecurity({});
