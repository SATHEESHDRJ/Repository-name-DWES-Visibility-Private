import { useEffect, useRef } from 'react';
import { emitFramesChanged } from '../utils/projectFramesEvents';
import { emitWorkflowChanged } from '../utils/dwesRefreshEvents';
import { emitDocumentsChanged } from '../utils/projectDocumentsEvents';
import { useLiveConnection } from '../store/useLiveConnection';
import { DWES_CLIENT_ID } from '../utils/clientId';

type ServerEventScope = 'project' | 'panel' | 'document' | 'assignment' | 'inspection' | 'engineering' | 'general' | 'heartbeat';

interface ServerEvent {
  scope: ServerEventScope;
  action?: 'created' | 'updated' | 'deleted';
  projectCode?: string;
  frameId?: string;
  assignmentId?: number;
  cableIndex?: number;
  wireId?: string;
  previousWireId?: string;
  nextWireId?: string;
  nextCableIndex?: number;
  actorId?: number;
  /** The browser tab that made the change. */
  originId?: string;
  at: string;
}

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;
/** More than two missed 25-second heartbeats means the stream is not healthy. */
const STREAM_STALE_MS = 65_000;

/**
 * Translate one server change event into the existing in-app event bus, so every
 * screen refreshes only the affected project/panel/row — no full-page reload.
 */
function dispatch(event: ServerEvent): void {
  const {
    scope,
    action = 'updated',
    projectCode,
    frameId,
    assignmentId,
    cableIndex,
    wireId,
    previousWireId,
    nextWireId,
    nextCableIndex,
  } = event;
  if (scope === 'heartbeat' || !projectCode) {
    if (scope === 'assignment' || scope === 'inspection') {
      emitWorkflowChanged({
        scope: 'general',
        assignmentId,
        cableIndex,
        wireId,
        previousWireId,
        nextWireId,
        nextCableIndex,
        frameId,
      });
    }
    return;
  }

  if (scope === 'project' || scope === 'panel') {
    emitFramesChanged({
      projectCode,
      frameId,
      entity: frameId ? 'panel' : 'project',
      action,
    });
    // Panel mutations (including assignment-scoped prep when framed) still wake workflow listeners.
    if (assignmentId != null || wireId || nextWireId) {
      emitWorkflowChanged({
        scope: 'assignment',
        projectCode,
        frameId,
        assignmentId,
        cableIndex,
        wireId,
        previousWireId,
        nextWireId,
        nextCableIndex,
      });
    }
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
    scope: scope === 'inspection' ? 'inspection' : scope === 'engineering' ? 'general' : 'assignment',
    projectCode,
    frameId,
    assignmentId,
    cableIndex,
    wireId,
    previousWireId,
    nextWireId,
    nextCableIndex,
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
  const touchEvent = useLiveConnection(state => state.touchEvent);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    stoppedRef.current = false;
    let retryMs = RETRY_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let activeController: AbortController | null = null;

    const connect = async () => {
      const token = localStorage.getItem('dwes_token');
      if (!token || stoppedRef.current) return;

      const controller = new AbortController();
      activeController = controller;
      let deliveredFrame = false;

      try {
        const response = await fetch('/api/events/stream', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          let staleTimer: ReturnType<typeof setTimeout> | null = null;
          const stale = new Promise<never>((_, reject) => {
            staleTimer = setTimeout(() => {
              controller.abort();
              reject(new Error('event stream heartbeat timed out'));
            }, STREAM_STALE_MS);
          });
          let result: ReadableStreamReadResult<Uint8Array>;
          try {
            result = await Promise.race([reader.read(), stale]);
          } finally {
            if (staleTimer) clearTimeout(staleTimer);
          }

          const { done, value } = result;
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
                if (!deliveredFrame) {
                  // Headers alone are not enough: a buffering/stalled proxy must not
                  // suppress fallback polling until a real SSE frame reaches us.
                  deliveredFrame = true;
                  retryMs = RETRY_MIN_MS;
                  setConnected(true);
                }
                touchEvent();
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
      activeController = null;
      if (stoppedRef.current) return;
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    };

    void connect();

    return () => {
      stoppedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      activeController?.abort();
      setConnected(false);
    };
  }, [enabled, setConnected, touchEvent]);
}
