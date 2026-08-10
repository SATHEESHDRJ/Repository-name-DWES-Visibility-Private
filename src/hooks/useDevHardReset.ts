import { useEffect, useState } from 'react';
import { authApi } from '../services/api';

/**
 * True when the Vite dev build AND backend allow dev hard reset
 * (`DEMO_MODE=true` or `ALLOW_DEV_HARD_RESET=true`).
 */
export function useDevHardReset(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    authApi.env()
      .then(e => setAllowed(!!e.dev_hard_reset_allowed))
      .catch(() => setAllowed(false));
  }, []);

  return import.meta.env.DEV && allowed;
}
