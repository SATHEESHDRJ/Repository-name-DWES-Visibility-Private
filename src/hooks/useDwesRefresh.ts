import { useEffect, useRef } from 'react';
import { DWES_BACKGROUND_POLL_MS } from '../constants/refreshIntervals';
import { onFramesChanged } from '../utils/projectFramesEvents';
import { onWorkflowChanged } from '../utils/dwesRefreshEvents';
import { useReadOnlyPoll } from './useReadOnlyPoll';
import { useLiveConnection } from '../store/useLiveConnection';

const EVENT_DEBOUNCE_MS = 300;

/** Passed to every background refresh so loaders can update in place, with no visible reload. */
export interface RefreshOptions {
  /**
   * True for automatic refreshes (server event, fallback poll, tab focus).
   * A silent loader must NOT show a spinner, blank its list, or reset the user's
   * selection, filters, scroll position, or open form — it swaps the data in place.
   */
  silent?: boolean;
}

export type RefreshFn = (options?: RefreshOptions) => void | Promise<void>;

export interface UseDwesRefreshOptions {
  /** Fallback poll interval, used only while the realtime stream is down. `null` disables it. */
  pollMs?: number | null;
  enabled?: boolean;
  listenFrames?: boolean;
  listenWorkflow?: boolean;
}

/**
 * Event-driven, silent data refresh.
 *
 * Server events (SSE) are the primary trigger; the interval poll runs ONLY while the
 * realtime stream is disconnected. Every automatic refresh is dispatched with
 * `{ silent: true }` so screens update in place instead of flashing a reload.
 * Frame/workflow events are debounced to avoid cascade refetches.
 */
export function useDwesRefresh(
  fetchFn: RefreshFn,
  options: UseDwesRefreshOptions = {},
) {
  const {
    pollMs = DWES_BACKGROUND_POLL_MS,
    enabled = true,
    listenFrames = true,
    listenWorkflow = true,
  } = options;

  const live = useLiveConnection(state => state.connected);

  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void fetchRef.current({ silent: true });
      }, EVENT_DEBOUNCE_MS);
    };

    const unsubs: Array<() => void> = [];
    if (listenFrames) unsubs.push(onFramesChanged(schedule));
    if (listenWorkflow) unsubs.push(onWorkflowChanged(schedule));

    return () => {
      unsubs.forEach(u => u());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, listenFrames, listenWorkflow]);

  // Polling is a fallback only: while the SSE stream is live, server events drive updates.
  // Tab focus/visibility still triggers a silent catch-up refresh either way.
  useReadOnlyPoll(
    () => {
      if (enabled) return fetchRef.current({ silent: true });
    },
    enabled && !live && pollMs != null ? pollMs : null,
  );
}
