import { create } from 'zustand';
import type { AuthUser, BootstrapStatus } from '../types';
import { authApi } from '../services/api';
import { PROJECT_SELECTION_STORAGE_KEY, useProjectSelectionStore } from './useProjectSelectionStore';
import { useLiveWiringStore } from './useLiveWiringStore';

const BOOTSTRAP_KEY = 'dwes_bootstrap';

function readBootstrap(): BootstrapStatus | null {
  try {
    const raw = localStorage.getItem(BOOTSTRAP_KEY);
    return raw ? JSON.parse(raw) as BootstrapStatus : null;
  } catch {
    return null;
  }
}

function persistBootstrap(b: BootstrapStatus | null) {
  if (!b) localStorage.removeItem(BOOTSTRAP_KEY);
  else localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(b));
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  bootstrap: BootstrapStatus | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string, projectCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  hydrateFromStorage: () => void;
  patchBootstrap: (patch: Partial<BootstrapStatus>) => void;
  clearBootstrap: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  bootstrap: null,
  isLoading: false,
  error: null,

  hydrateFromStorage: () => {
    try {
      const token = localStorage.getItem('dwes_token');
      const userRaw = localStorage.getItem('dwes_user');
      const bootstrap = readBootstrap();
      if (token && userRaw) {
        set({ token, user: JSON.parse(userRaw), bootstrap });
      }
    } catch {
      localStorage.removeItem('dwes_token');
      localStorage.removeItem('dwes_refresh_token');
      localStorage.removeItem('dwes_user');
      localStorage.removeItem(BOOTSTRAP_KEY);
    }
  },

  login: async (username, password, projectCode) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authApi.login(username, password, projectCode);
      sessionStorage.removeItem(PROJECT_SELECTION_STORAGE_KEY);
      useProjectSelectionStore.getState().clearSelection();
      useLiveWiringStore.getState().clear();
      localStorage.setItem('dwes_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('dwes_refresh_token', data.refresh_token);
      localStorage.setItem('dwes_user', JSON.stringify(data.user));
      const bootstrap = data.bootstrap ?? null;
      persistBootstrap(bootstrap?.required ? bootstrap : null);
      set({
        user: data.user,
        token: data.access_token,
        bootstrap: bootstrap?.required ? bootstrap : null,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: { message?: string } };
        code?: string;
        message?: string;
      };
      const status = ax.response?.status;

      console.error('[auth] login failed:', {
        status: status ?? '(no response)',
        code: ax.code,
        message: ax.message,
        data: ax.response?.data,
      });

      let msg: string;
      if (status === 401 || status === 403) {
        msg = 'Incorrect username or password.';
      } else if (status === undefined || status >= 500) {
        msg = "Can't reach the server. Please try again or contact support.";
      } else {
        msg = ax.response?.data?.message || 'Login failed. Please try again.';
      }

      set({ isLoading: false, error: msg });
      throw err;
    }
  },

  logout: async () => {
    const refresh = localStorage.getItem('dwes_refresh_token') ?? undefined;
    try { await authApi.logout(refresh); } catch { /* ignore */ }
    localStorage.removeItem('dwes_token');
    localStorage.removeItem('dwes_refresh_token');
    localStorage.removeItem('dwes_user');
    localStorage.removeItem(BOOTSTRAP_KEY);
    sessionStorage.removeItem(PROJECT_SELECTION_STORAGE_KEY);
    useProjectSelectionStore.getState().clearSelection();
    useLiveWiringStore.getState().clear();
    set({ user: null, token: null, bootstrap: null, error: null });
  },

  clearError: () => set({ error: null }),

  patchBootstrap: (patch) => {
    const current = get().bootstrap;
    if (!current) return;
    const needsPassword = patch.needs_password_rotation ?? current.needs_password_rotation;
    const needsWebAuthn = patch.needs_webauthn_enrollment ?? current.needs_webauthn_enrollment;
    const next: BootstrapStatus = {
      needs_password_rotation: needsPassword,
      needs_webauthn_enrollment: needsWebAuthn,
      required: needsPassword || needsWebAuthn,
    };
    if (!next.required) {
      persistBootstrap(null);
      set({ bootstrap: null });
      return;
    }
    persistBootstrap(next);
    set({ bootstrap: next });
  },

  clearBootstrap: () => {
    persistBootstrap(null);
    set({ bootstrap: null });
  },
}));

if (typeof window !== 'undefined') {
  useAuthStore.getState().hydrateFromStorage();
}
