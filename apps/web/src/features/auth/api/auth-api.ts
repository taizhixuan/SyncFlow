import type { AuthResponse, UserPublic } from '@syncflow/shared';
import { api } from '@/lib/api';

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

/** Restore a session from the refresh cookie on app load. Returns null if anonymous. */
export async function restoreSession(): Promise<UserPublic | null> {
  try {
    const res = await api.post<AuthResponse>('/auth/refresh');
    api.setAccessToken(res.accessToken);
    return res.user;
  } catch {
    api.setAccessToken(null);
    return null;
  }
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
