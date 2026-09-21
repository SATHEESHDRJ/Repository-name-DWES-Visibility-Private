import { create } from 'zustand';
import type { AuthUser } from '../types';
import { authApi } from '../services/api';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string, projectCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  hydrateFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,

  hydrateFromStorage: () => {
    try {
      const token = localStorage.getItem('dwes_token');
      const userRaw = localStorage.getItem('dwes_user');
      if (token && userRaw) {
        set({ token, user: JSON.parse(userRaw) });
      }
    } catch {
      localStorage.removeItem('dwes_token');
      localStorage.removeItem('dwes_user');
    }
  },

  login: async (username, password, projectCode) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authApi.login(username, password, projectCode);
      localStorage.setItem('dwes_token', data.access_token);
      localStorage.setItem('dwes_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.access_token, isLoading: false, error: null });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Login failed — check credentials';
      set({ isLoading: false, error: msg });
      throw err;
    }
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('dwes_token');
    localStorage.removeItem('dwes_user');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
