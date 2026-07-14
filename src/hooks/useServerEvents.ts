import { useEffect, useRef } from 'react';
import { emitFramesChanged } from '../utils/projectFramesEvents';
import { emitWorkflowChanged } from '../utils/dwesRefreshEvents';
import { emitDocumentsChanged } from '../utils/projectDocumentsEvents';
import { useLiveConnection } from '../store/useLiveConnection';
import { DWES_CLIENT_ID } from '../utils/clientId';

type ServerEventScope = 'project' | 'panel' | 'document' | 'assignment' | 'inspection' | 'general' | 'heartbeat';

interface ServerEvent {
  scope: ServerEventScope;
  action?: 'created' | 'updated' | 'deleted';
  projectCode?: string;
  frameId?: string;
  actorId?: number;
  /** The browser tab that made the change. */
  originId?: string;
  at: string;
}

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/**
 * Translate one server change event into the existing in-app event bus, so every
 * screen refreshes only the affected project/panel/row — no full-page reload.
 */
function dispatch(event: ServerEvent): void {
  const { scope, action = 'updated', projectCode, frameId } = event;
  if (scope === 'heartbeat' || !projectCode) {
    if (scope === 'assignment' || scope === 'inspection') emitWorkflowChanged({ scope: 'general' });
    return;
  }

  if (scope === 'project' || scope === 'panel') {
    emitFramesChanged({
      projectCode,
      frameId,
      entity: frameId ? 'panel' : 'project',
      action,
    });
    return;
  }

  if (scope === 'document') {
    emitDocumentsChanged({
      projectCode,
      frameId,
      kind: 'both',
      action: action === 'created' ? 'uploaded' : action === 'deleted' ? 'deleted' : 'replaced',
    });
    return;
  }

  emitWorkflowChanged({
    scope: scope === 'inspection' ? 'inspection' : 'assignment',
    projectCode,
    frameId,
  });
}

/**
 * Subscribes to the backend change stream (SSE over fetch, so the JWT travels in
 * the Authorization header rather than the URL).
 *
 * - Reports connection state, so polling runs only while the stream is down.
 * - Drops the echo of a change THIS TAB made (it already refreshed locally), while
 *   still applying changes from every other tab — including the same user on a
 *   second device.
 * - Reconnects with exponential backoff.
 */
export function useServerEvents(enabled: boolean): void {
  const stoppedRef = useRef(false);
  const setConnected = useLiveConnection(state => state.setConnected);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    stoppedRef.current = false;
    const controller = new AbortController();
    let retryMs = RETRY_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const token = localStorage.getItem('dwes_token');
      if (!token || stoppedRef.current) return;

      try {
        const response = await fetch('/api/events/stream', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

        retryMs = RETRY_MIN_MS; // connected — reset backoff
        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; each carries one `data:` payload.
          let split = buffer.indexOf('\n\n');
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const payload = frame
              .split('\n')
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trim())
              .join('');
            if (payload) {
              try {
                const event = JSON.parse(payload) as ServerEvent;
                // Skip only what this very tab caused; another device's change still applies.
                const isOwnEcho = event.originId != null && event.originId === DWES_CLIENT_ID;
                if (!isOwnEcho) dispatch(event);
              } catch { /* ignore a malformed frame; the fallback poll still covers us */ }
            }
            split = buffer.indexOf('\n\n');
          }
        }
      } catch {
        /* network drop, backend restart, or abort — handled by the retry below */
      }

      setConnected(false);
      if (stoppedRef.current || controller.signal.aborted) return;
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    };

    void connect();

    return () => {
      stoppedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      controller.abort();
      setConnected(false);
    };
  }, [enabled, setConnected]);
}
