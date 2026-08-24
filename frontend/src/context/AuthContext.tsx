import React, { createContext, useContext, useState, useCallback } from 'react';
import { API_BASE } from '../api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'AGENT' | 'ADMIN';
}

interface AuthState {
  user: User | null;
  token: string | null;
  agentId: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const saved = sessionStorage.getItem('lmd_auth');
      return saved ? JSON.parse(saved) : { user: null, token: null, agentId: null };
    } catch {
      return { user: null, token: null, agentId: null };
    }
  });

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');

    const next: AuthState = { user: data.user, token: data.accessToken, agentId: data.agentId || null };
    setState(next);
    // NOTE: Storing token in sessionStorage. In production, use httpOnly cookie + CSRF protection.
    sessionStorage.setItem('lmd_auth', JSON.stringify(next));
    if (data.refreshToken) sessionStorage.setItem('lmd_refresh', data.refreshToken);
  }, []);

  const logout = useCallback(() => {
    setState({ user: null, token: null, agentId: null });
    sessionStorage.removeItem('lmd_auth');
    sessionStorage.removeItem('lmd_refresh');
  }, []);

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
