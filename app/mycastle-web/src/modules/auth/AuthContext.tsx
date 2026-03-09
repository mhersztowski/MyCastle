import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { minisApi, type UserPublic } from '../../services/MinisApiService';
import { rpcClient } from '../../services/RpcClient';

interface AuthSession {
  user: UserPublic;
  token: string;
}

interface AuthContextValue {
  currentUser: UserPublic | null;
  token: string | null;
  isAdmin: boolean;
  login: (name: string, password: string) => Promise<UserPublic>;
  logout: () => void;
  impersonating: UserPublic | null;
  startImpersonating: (user: UserPublic) => void;
  stopImpersonating: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'minis_current_user';

function restoreSession(): AuthSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Support new format { user, token } and legacy format (user object directly)
    if (parsed.token && parsed.user) return parsed as AuthSession;
    return null;
  } catch {
    return null;
  }
}

function applyToken(token: string | null): void {
  minisApi.setAuthToken(token);
  rpcClient.setAuthToken(token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const restored = restoreSession();
    if (restored) applyToken(restored.token);
    return restored;
  });
  const [impersonating, setImpersonating] = useState<UserPublic | null>(null);

  // Keep services in sync if session changes
  useEffect(() => {
    applyToken(session?.token ?? null);
  }, [session]);

  const login = useCallback(async (name: string, password: string): Promise<UserPublic> => {
    const response = await minisApi.login(name, password);
    const newSession: AuthSession = { user: response.user, token: response.token };
    applyToken(response.token);
    setSession(newSession);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    return response.user;
  }, []);

  const logout = useCallback(() => {
    applyToken(null);
    setSession(null);
    setImpersonating(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const startImpersonating = useCallback((user: UserPublic) => {
    if (session?.user?.isAdmin) {
      setImpersonating(user);
    }
  }, [session]);

  const stopImpersonating = useCallback(() => {
    setImpersonating(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      currentUser: session?.user ?? null,
      token: session?.token ?? null,
      isAdmin: session?.user?.isAdmin ?? false,
      login,
      logout,
      impersonating,
      startImpersonating,
      stopImpersonating,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
