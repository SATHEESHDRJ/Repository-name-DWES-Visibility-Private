import { useEffect, useRef } from 'react';
import { DWES_BACKGROUND_POLL_MS } from '../constants/refreshIntervals';
import { onFramesChanged } from '../utils/projectFramesEvents';
import { onWorkflowChanged } from '../utils/dwesRefreshEvents';
import { useReadOnlyPoll } from './useReadOnlyPoll';

const EVENT_DEBOUNCE_MS = 300;

export interface UseDwesRefreshOptions {
  /** Interval poll; `null` = events + tab-focus only. */
  pollMs?: number | null;
  enabled?: boolean;
  listenFrames?: boolean;
  listenWorkflow?: boolean;
}

/**
 * Event-driven data refresh with optional slow background poll.
 * Debounces `dwes:frames-changed` and `dwes:workflow-changed` to avoid cascade refetches.
 */
export function useDwesRefresh(
  fetchFn: () => void | Promise<void>,
  options: UseDwesRefreshOptions = {},
) {
  const {
    pollMs = DWES_BACKGROUND_POLL_MS,
    enabled = true,
    listenFrames = true,
    listenWorkflow = true,
  } = options;

  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void fetchRef.current();
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

  useReadOnlyPoll(
    () => {
      if (enabled) return fetchRef.current();
    },
    enabled && pollMs != null ? pollMs : null,
  );
}
