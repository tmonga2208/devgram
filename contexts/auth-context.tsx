"use client"

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import type { NotificationSettings, PrivacySettings } from '@/lib/types';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatar: string;
  bio?: string;
  website?: string;
  github?: { login: string } | null;
  notificationSettings?: NotificationSettings;
  privacySettings?: PrivacySettings;
}

export interface ProfileUpdate {
  fullName?: string;
  bio?: string;
  website?: string;
  avatar?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  notificationSettings?: Partial<NotificationSettings>;
  privacySettings?: Partial<PrivacySettings>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  updateProfile: (data: ProfileUpdate) => Promise<void>;
  disconnectGitHub: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function setTokenCookie(token: string) {
  // Read by middleware.ts to protect pages
  Cookies.set('token', token, { expires: 7, sameSite: 'lax' });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const storeUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
  }, []);

  const storeSession = useCallback((nextToken: string, nextUser: User) => {
    setToken(nextToken);
    localStorage.setItem('token', nextToken);
    setTokenCookie(nextToken);
    storeUser(nextUser);
  }, [storeUser]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    Cookies.remove('token');
    router.push('/login');
  }, [router]);

  const authFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(input, { ...init, headers });
    // An authenticated request answering 401 means the token expired or was revoked.
    if (response.status === 401 && token) logout();
    return response;
  }, [token, logout]);

  // Restore the stored session, then refresh the user from the server.
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = readStoredUser();

    if (!storedToken || !storedUser) {
      setLoading(false);
      return;
    }

    setToken(storedToken);
    setUser(storedUser);
    setTokenCookie(storedToken);
    setLoading(false);

    let cancelled = false;
    fetch('/api/users/profile', { headers: { Authorization: `Bearer ${storedToken}` } })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          logout();
        } else if (response.ok) {
          const fresh = (await response.json()) as User;
          if (!cancelled) storeUser(fresh);
        }
      })
      .catch(() => {
        // Offline or server down: keep the stored session.
      });

    return () => {
      cancelled = true;
    };
  }, [logout, storeUser]);

  const authenticate = async (path: string, body: Record<string, string>, fallback: string) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.token) {
      throw new Error(data?.error || fallback);
    }
    storeSession(data.token, data.user);
    router.push('/');
  };

  const login = (email: string, password: string) =>
    authenticate('/api/auth/login', { email, password }, 'Login failed');

  const register = (username: string, email: string, password: string, fullName: string) =>
    authenticate('/api/auth/register', { username, email, password, fullName }, 'Registration failed');

  const updateProfile = async (data: ProfileUpdate) => {
    const response = await authFetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await response.json().catch(() => null);
    if (!response.ok || !updated) {
      throw new Error(updated?.error || 'Failed to update profile');
    }
    storeUser(updated as User);
  };

  const disconnectGitHub = async () => {
    const response = await authFetch('/api/github/connect', { method: 'DELETE' });
    const updated = await response.json().catch(() => null);
    if (!response.ok || !updated) {
      throw new Error(updated?.error || 'Failed to disconnect GitHub');
    }
    storeUser(updated as User);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        updateProfile,
        disconnectGitHub,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
