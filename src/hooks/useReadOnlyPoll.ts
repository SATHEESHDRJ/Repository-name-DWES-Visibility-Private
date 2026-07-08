import { useEffect, useRef } from 'react';

/**
 * Lightweight read-only polling for dashboard data.
 * Pauses when the tab is hidden; skips overlapping requests; keeps last good state on failure.
 */
export function useReadOnlyPoll(fetchFn: () => void | Promise<void>, intervalMs = 4000) {
  const inFlightRef = useRef(false);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    const tick = async () => {
      if (document.hidden || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await fetchRef.current();
      } catch {
        /* caller retains last good values */
      } finally {
        inFlightRef.current = false;
      }
    };

    const id = setInterval(tick, intervalMs);
    const onVis = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [intervalMs]);
}
