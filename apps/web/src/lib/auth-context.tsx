'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from './api-client';

export interface AuthUser {
  publicId: string;
  username: string;
  roles: string[];
  /** رقم الهاتف المسجَّل (E.164) — ثابت ولا يتغيّر أبداً */
  phone?: string | null;
  /** عنوان حساب Sham Cash المسجَّل — ثابت ولا يتغيّر أبداً */
  shamcashAddress?: string | null;
}

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  /** True only while the initial silent-refresh check (on page load) is running. */
  isLoading: boolean;
  login: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The access token lives ONLY in memory (React state) — never localStorage/sessionStorage.
  // A token stolen from memory via XSS requires the XSS to run at that exact moment; a token
  // sitting in localStorage is readable by any injected script at any time. Losing it on a
  // hard refresh is the accepted trade-off, recovered silently below via the HttpOnly
  // refresh-token cookie that /auth/login already sets.
  async function afterAuth(token: string) {
    setAccessToken(token);
    const me = await apiFetch<AuthUser & { status: string }>('/users/me', { accessToken: token });
    if (me.success && me.data) {
      setUser({ publicId: me.data.publicId, username: me.data.username, roles: me.data.roles ?? [], phone: me.data.phone ?? null, shamcashAddress: me.data.shamcashAddress ?? null });
    }
  }

  useEffect(() => {
    apiFetch<{ accessToken: string }>('/auth/refresh', { method: 'POST' })
      .then((res) => {
        if (res.success && res.data) return afterAuth(res.data.accessToken);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (token: string) => {
    await afterAuth(token);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST', accessToken: accessToken ?? undefined });
    setAccessToken(null);
    setUser(null);
  }, [accessToken]);

  return (
    <AuthContext.Provider value={{ accessToken, user, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
