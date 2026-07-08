import { create } from 'zustand';
import type { AuthUser } from '../types';
import { authApi } from '../services/api';
import { PROJECT_SELECTION_STORAGE_KEY } from './useProjectSelectionStore';

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
      const ax = err as {
        response?: { status?: number; data?: { message?: string } };
        code?: string;
        message?: string;
      };
      const status = ax.response?.status;

      // Log the real status/error for debugging — the user only sees the friendly text.
      console.error('[auth] login failed:', {
        status: status ?? '(no response)',
        code: ax.code,
        message: ax.message,
        data: ax.response?.data,
      });

      let msg: string;
      if (status === 401 || status === 403) {
        // Reached the server, credentials rejected
        msg = 'Incorrect username or password.';
      } else if (status === undefined || status >= 500) {
        // No response (backend down / network) OR server/proxy error (500, 502, 503…)
        msg = "Can't reach the server. Please try again or contact support.";
      } else {
        // Other 4xx (e.g. 400 validation) — surface server text if present
        msg = ax.response?.data?.message || 'Login failed. Please try again.';
      }

      set({ isLoading: false, error: msg });
      throw err;
    }
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('dwes_token');
    localStorage.removeItem('dwes_user');
    sessionStorage.removeItem(PROJECT_SELECTION_STORAGE_KEY);
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

if (typeof window !== 'undefined') {
  useAuthStore.getState().hydrateFromStorage();
}
