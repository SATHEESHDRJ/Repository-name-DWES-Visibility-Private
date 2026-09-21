import { useCallback, useEffect, useMemo, useRef } from 'react';
import { LatestRequestGate } from '../utils/latestRequestGate';

export interface LatestRequest {
  id: number;
  signal: AbortSignal;
}

/**
 * Cancels the previous read and gives callers a generation token. Components
 * must check `isLatest(id)` before applying a response, including in `catch` and
 * `finally`, so an older request can never restore deleted state.
 */
export function useLatestRequest() {
  const gateRef = useRef(new LatestRequestGate());
  const controllerRef = useRef<AbortController | null>(null);

  const begin = useCallback((): LatestRequest => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    return { id: gateRef.current.begin(), signal: controllerRef.current.signal };
  }, []);

  const isLatest = useCallback((id: number) => gateRef.current.isLatest(id), []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    gateRef.current.invalidate();
  }, []);

  useEffect(() => cancel, [cancel]);

  // Stable identity so callers can list `requests` itself as an effect dependency.
  return useMemo(() => ({ begin, isLatest, cancel }), [begin, isLatest, cancel]);
}
