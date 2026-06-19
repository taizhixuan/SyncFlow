import { API_PREFIX } from '@syncflow/shared';

/** httpOnly cookie carrying the opaque refresh token. */
export const REFRESH_COOKIE = 'sf_refresh';

/** Scope the refresh cookie to the auth routes only. */
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;
