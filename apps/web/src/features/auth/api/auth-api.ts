import type { AuthResponse, UserPublic } from '@syncflow/shared';
import { api } from '@/lib/api';

export interface UpdateProfileInput {
  displayName?: string;
  color?: string;
  avatarUrl?: string | null;
}

export async function signup(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/signup', input);
  api.setAccessToken(res.accessToken);
  return res;
}

export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/login', input);
  api.setAccessToken(res.accessToken);
  return res;
}

/**
 * Restore a session from the refresh cookie on app load. Returns null if
 * anonymous. Routed through the client's deduplicated refresh so React
 * StrictMode's double-mount (two restoreSession calls) doesn't present the same
 * rotating token twice and trip server-side reuse-detection, which would revoke
 * the whole token family and kill the session. The token is set internally.
 */
export async function restoreSession(): Promise<UserPublic | null> {
  const session = await api.refreshSession();
  return session ? (session.user as UserPublic) : null;
}

export function getMe(): Promise<UserPublic> {
  return api.get<UserPublic>('/users/me');
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    api.setAccessToken(null);
  }
}

export function updateProfile(input: UpdateProfileInput): Promise<UserPublic> {
  return api.patch<UserPublic>('/users/me', input);
}
