import { create } from 'zustand';

interface LiveConnectionState {
  /** True while the server change stream (SSE) is delivering events. */
  connected: boolean;
  /** ISO timestamp of the last delivered SSE frame (null until first frame). */
  lastEventAt: string | null;
  setConnected: (connected: boolean) => void;
  touchEvent: () => void;
}

/**
 * Tracks the realtime channel so background polling runs ONLY as a fallback.
 * While `connected` is true, screens refresh from server events instead of timers.
 */
export const useLiveConnection = create<LiveConnectionState>(set => ({
  connected: false,
  lastEventAt: null,
  setConnected: connected => set(state => (state.connected === connected ? state : { connected })),
  touchEvent: () => set({ lastEventAt: new Date().toISOString() }),
}));
