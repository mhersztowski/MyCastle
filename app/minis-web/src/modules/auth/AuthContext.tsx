import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { minisApi, type UserPublic } from '../../services/MinisApiService';

interface AuthContextValue {
  currentUser: UserPublic | null;
  isAdmin: boolean;
  login: (userId: string, password: string) => Promise<UserPublic>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'minis_current_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (userId: string, password: string): Promise<UserPublic> => {
    const user = await minisApi.login(userId, password);
    setCurrentUser(user);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return user;
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isAdmin: currentUser?.isAdmin ?? false, login, logout }}>
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
