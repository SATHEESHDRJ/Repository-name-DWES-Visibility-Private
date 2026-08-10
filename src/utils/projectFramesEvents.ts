import { excludeDeletedEntity } from './entityConsistency';

/** Cross-tab signal when project or panel lists change (create, update, delete). */

export type FramesChangedAction = 'created' | 'updated' | 'deleted';

export interface FramesChangedDetail {
  projectCode: string;
  frameId?: string;
  action: FramesChangedAction;
  entity?: 'project' | 'panel';
  mutationId?: string;
}

const EVENT = 'dwes:frames-changed';
const CHANNEL = 'dwes-entity-sync-v1';
const STORAGE_SIGNAL = 'dwes-entity-sync-signal';
const PROJECT_SELECTION_KEY = 'dwes-project-selection-session';
const ASSIGNMENT_QUEUE_KEY = 'dwes-assignment-queue-v1';
const WIRING_PREFS_PREFIX = 'dwes-wiring-cols-v1:';

function normalized(detail: FramesChangedDetail): FramesChangedDetail {
  return {
    ...detail,
    entity: detail.entity ?? (detail.frameId ? 'panel' : 'project'),
    mutationId: detail.mutationId
      ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
}

function removeMatchingKeys(storage: Storage, predicate: (key: string) => boolean) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && predicate(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/** Remove entity-bearing browser data before any refetch is allowed to render. */
export function purgeDeletedEntityStorage(detail: FramesChangedDetail): void {
  if (detail.action !== 'deleted') return;
  const entity = detail.entity ?? (detail.frameId ? 'panel' : 'project');
  try {
    const raw = sessionStorage.getItem(PROJECT_SELECTION_KEY);
    if (entity === 'project' && raw) {
      const parsed = JSON.parse(raw) as { state?: { selectedProject?: { code?: string } | null } };
      if (parsed.state?.selectedProject?.code === detail.projectCode) {
        parsed.state.selectedProject = null;
        sessionStorage.setItem(PROJECT_SELECTION_KEY, JSON.stringify(parsed));
      }
    }

    const queueRaw = localStorage.getItem(ASSIGNMENT_QUEUE_KEY);
    if (queueRaw) {
      const queue = JSON.parse(queueRaw) as Array<{ projectCode?: string; panelId?: string }>;
      if (Array.isArray(queue)) {
        const filtered = excludeDeletedEntity(queue as Array<{ projectCode: string; panelId?: string }>, {
          projectCode: detail.projectCode,
          frameId: entity === 'panel' ? detail.frameId : undefined,
        });
        localStorage.setItem(ASSIGNMENT_QUEUE_KEY, JSON.stringify(filtered));
      }
    }

    if (detail.frameId) {
      removeMatchingKeys(localStorage, key => key === `${WIRING_PREFS_PREFIX}${detail.frameId}`);
      removeMatchingKeys(sessionStorage, key => key === `${WIRING_PREFS_PREFIX}${detail.frameId}`);
    }
  } catch {
    // Storage can be unavailable in privacy modes; server validation remains authoritative.
  }
}

export function emitFramesChanged(detail: FramesChangedDetail): void {
  const next = normalized(detail);
  purgeDeletedEntityStorage(next);
  window.dispatchEvent(new CustomEvent<FramesChangedDetail>(EVENT, { detail: next }));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(next);
    channel.close();
  } catch {
    try {
      localStorage.setItem(STORAGE_SIGNAL, JSON.stringify(next));
      localStorage.removeItem(STORAGE_SIGNAL);
    } catch { /* storage unavailable */ }
  }
}

export function onFramesChanged(handler: (detail: FramesChangedDetail) => void): () => void {
  const seen = new Set<string>();
  const deliver = (raw: FramesChangedDetail) => {
    if (!raw?.projectCode) return;
    const detail = normalized(raw);
    if (detail.mutationId && seen.has(detail.mutationId)) return;
    if (detail.mutationId) {
      seen.add(detail.mutationId);
      if (seen.size > 100) seen.delete(seen.values().next().value as string);
    }
    purgeDeletedEntityStorage(detail);
    handler(detail);
  };
  const listener = (e: Event) => deliver((e as CustomEvent<FramesChangedDetail>).detail);
  const storageListener = (e: StorageEvent) => {
    if (e.key !== STORAGE_SIGNAL || !e.newValue) return;
    try { deliver(JSON.parse(e.newValue) as FramesChangedDetail); } catch { /* malformed */ }
  };
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = event => deliver(event.data as FramesChangedDetail);
  } catch { /* BroadcastChannel unavailable */ }
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', storageListener);
    channel?.close();
  };
}
