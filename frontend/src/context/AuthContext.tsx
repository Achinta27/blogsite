import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { authApi } from '../api';
import { refreshSession, setAccessToken, SESSION_EXPIRED_EVENT, type SessionPayload } from '../api/client';

interface AuthContextValue {
  user: User | null;
  /** True until the initial session check has finished. */
  loading: boolean;
  isAdmin: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Restores the session from the refresh cookie (used after OAuth). */
  restoreSession: () => Promise<boolean>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: SessionPayload) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      applySession(await refreshSession());
      return true;
    } catch {
      setAccessToken(null);
      setUser(null);
      return false;
    }
  }, [applySession]);

  useEffect(() => {
    restoreSession().finally(() => setLoading(false));

    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [restoreSession]);

  const login = useCallback(
    async (credentials: { email: string; password: string }) => applySession(await authApi.login(credentials)),
    [applySession]
  );

  const register = useCallback(
    async (data: { name: string; email: string; password: string }) => applySession(await authApi.register(data)),
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAdmin: user?.role === 'admin', login, register, logout, restoreSession, setUser }),
    [user, loading, login, register, logout, restoreSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
