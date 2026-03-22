import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User } from '@/types/game';
import { apiFetch, getToken, setToken, clearToken } from '@/lib/api';
import { setSoundEnabled } from '@/lib/sounds';

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (data: RegisterData) => Promise<AuthResult>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthday: string;
  country: string;
  countryCode: string;
  avatar: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: restore session from stored JWT
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch<{ user: User }>('/auth/me')
      .then(data => setUser(data.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  // Keep sound engine in sync with current authenticated user's preference.
  useEffect(() => {
    setSoundEnabled(user?.preferences?.soundEnabled ?? true);
  }, [user?.preferences?.soundEnabled]);

  const login = useCallback(async (username: string, password: string): Promise<AuthResult> => {
    try {
      const data = await apiFetch<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<AuthResult> => {
    try {
      const res = await apiFetch<{ token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setToken(res.token);
      setUser(res.user);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Registration failed' };
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore server error – always clear local session
    }
    clearToken();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<User>): Promise<void> => {
    const data = await apiFetch<{ user: User }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
