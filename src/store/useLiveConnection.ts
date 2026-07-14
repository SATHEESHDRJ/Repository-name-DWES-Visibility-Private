import { create } from 'zustand';

interface LiveConnectionState {
  /** True while the server change stream (SSE) is delivering events. */
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

/**
 * Tracks the realtime channel so background polling runs ONLY as a fallback.
 * While `connected` is true, screens refresh from server events instead of timers.
 */
export const useLiveConnection = create<LiveConnectionState>(set => ({
  connected: false,
  setConnected: connected => set(state => (state.connected === connected ? state : { connected })),
}));
