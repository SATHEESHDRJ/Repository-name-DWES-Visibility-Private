import { useEffect, useState } from 'react';
import { authApi } from '../services/api';

/**
 * True only when BOTH the Vite dev build AND backend DEMO_MODE=true.
 * Production builds never show demo helpers (import.meta.env.DEV is false).
 */
export function useDemoMode(): boolean {
  const [backendDemo, setBackendDemo] = useState(false);

  useEffect(() => {
    authApi.env()
      .then(e => setBackendDemo(!!e.demo_mode))
      .catch(() => setBackendDemo(false));
  }, []);

  return import.meta.env.DEV && backendDemo;
}
