/** Cross-tab signal when project frame/panel lists change (create, update, delete). */

export type FramesChangedAction = 'created' | 'updated' | 'deleted';

export interface FramesChangedDetail {
  projectCode: string;
  frameId?: string;
  action: FramesChangedAction;
}

const EVENT = 'dwes:frames-changed';

export function emitFramesChanged(detail: FramesChangedDetail): void {
  window.dispatchEvent(new CustomEvent<FramesChangedDetail>(EVENT, { detail }));
}

export function onFramesChanged(handler: (detail: FramesChangedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<FramesChangedDetail>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
