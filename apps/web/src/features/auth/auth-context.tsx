import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserPublic } from '@syncflow/shared';
import { api } from '@/lib/api';
import { readSessionHint, writeSessionHint } from '@/lib/ui-preferences';
import * as authApi from './api/auth-api';

/**
 * `error` means we could not find out whether there is a session (API cold
 * start, offline, CORS) — distinct from `anonymous`, and recoverable via retry.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: UserPublic | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  /** Always resolves: local state is cleared even when the server call fails. */
  logout: () => Promise<void>;
  updateUser: (updates: Partial<UserPublic>) => void;
  /** Re-attempt the session restore after an `error` status. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Whether 'anonymous' rests only on this browser's signed-out hint. The hint is
 * stored per web origin while the refresh cookie belongs to the API host, so it
 * can be stale (apex vs www, a preview URL, a session made elsewhere).
 */
export interface SessionProbe {
  /** True while signed-out status came from the hint, not from the server. */
  unconfirmed: boolean;
  /** Ask the server once, if the hint is all there is; otherwise a no-op. */
  confirm: () => void;
}

const SessionProbeContext = createContext<SessionProbe>({
  unconfirmed: false,
  confirm: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserPublic | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const statusRef = useRef<AuthStatus>(status);
  statusRef.current = status;

  useEffect(() => {
    let active = true;
    // Known signed out: don't ask on load, so public pages make no doomed
    // request. A protected page or an explicit retry still asks (see
    // SessionProbe), in case the hint is stale.
    if (readSessionHint() === false && restoreAttempt === 0) {
      setUser(null);
      setStatus('anonymous');
      setUnconfirmed(true);
      return;
    }
    setUnconfirmed(false);
    authApi.restoreSession().then(
      (restored) => {
        if (!active) return;
        writeSessionHint(!!restored);
        setUser(restored);
        setStatus(restored ? 'authenticated' : 'anonymous');
      },
      (err: unknown) => {
        if (!active) return;
        console.warn('[auth] could not restore the session', err);
        setUser(null);
        setStatus('error');
      },
    );
    return () => {
      active = false;
    };
  }, [restoreAttempt]);

  // The api client drops the token when a transparent refresh is rejected (the
  // session expired or was revoked). Without this the UI would stay
  // "authenticated" while every request 401s; ProtectedRoute then redirects to
  // /login with a returnTo.
  useEffect(
    () =>
      api.onTokenChange((token) => {
        if (token !== null || statusRef.current !== 'authenticated') return;
        writeSessionHint(false);
        queryClient.clear();
        setUser(null);
        setStatus('anonymous');
        setUnconfirmed(false);
      }),
    [queryClient],
  );

  // Every tab shares the refresh cookie, so once another tab signs in as someone
  // else, this tab's next refresh is that person's session. Follow it openly —
  // drop everything cached for the old identity — rather than keep showing the
  // old user while acting as the new one.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  useEffect(
    () =>
      api.onSessionUser((refreshed) => {
        const next = refreshed as UserPublic | null;
        if (statusRef.current !== 'authenticated' || !next?.id) return;
        if (next.id === userIdRef.current) return;
        userIdRef.current = next.id;
        queryClient.clear();
        setUser(next);
      }),
    [queryClient],
  );

  const retry = useCallback(() => {
    setStatus('loading');
    setRestoreAttempt((n) => n + 1);
  }, []);

  const confirmSession = useCallback(() => {
    if (!unconfirmed) return;
    setUnconfirmed(false);
    retry();
  }, [unconfirmed, retry]);

  // Drop everything cached for the previous identity so the next user never
  // sees it, even for a frame.
  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login({ email, password });
      writeSessionHint(true);
      queryClient.clear();
      setUser(res.user);
      setStatus('authenticated');
    },
    [queryClient],
  );

  const signup = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await authApi.signup({ email, password, displayName });
      writeSessionHint(true);
      queryClient.clear();
      setUser(res.user);
      setStatus('authenticated');
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // The local session is gone regardless; the server call failing only
      // means the refresh cookie may outlive this tab's logout.
      console.warn('[auth] server logout failed; cleared the local session anyway', err);
    } finally {
      writeSessionHint(false);
      queryClient.clear();
      setUser(null);
      setStatus('anonymous');
      setUnconfirmed(false);
    }
  }, [queryClient]);

  const updateUser = useCallback((updates: Partial<UserPublic>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout, updateUser, retry }),
    [status, user, login, signup, logout, updateUser, retry],
  );

  const probe = useMemo<SessionProbe>(
    () => ({ unconfirmed, confirm: confirmSession }),
    [unconfirmed, confirmSession],
  );

  return (
    <AuthContext.Provider value={value}>
      <SessionProbeContext.Provider value={probe}>{children}</SessionProbeContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** See SessionProbe. Safe outside an AuthProvider (reports a settled state). */
export function useSessionProbe(): SessionProbe {
  return useContext(SessionProbeContext);
}
