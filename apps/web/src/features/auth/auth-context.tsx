import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserPublic } from '@syncflow/shared';
import * as authApi from './api/auth-api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserPublic | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<UserPublic>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserPublic | null>(null);

  useEffect(() => {
    let active = true;
    void authApi.restoreSession().then((restored) => {
      if (!active) return;
      setUser(restored);
      setStatus(restored ? 'authenticated' : 'anonymous');
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await authApi.signup({ email, password, displayName });
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const updateUser = useCallback((updates: Partial<UserPublic>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout, updateUser }),
    [status, user, login, signup, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
