/** Cross-tab signal when project drawings or panel wiring schedules change. */

export type DocumentChangedKind = 'drawing' | 'wiring' | 'both';

export interface DocumentsChangedDetail {
  projectCode: string;
  frameId?: string;
  kind: DocumentChangedKind;
  action: 'uploaded' | 'deleted' | 'replaced';
}

const EVENT = 'dwes:documents-changed';

export function emitDocumentsChanged(detail: DocumentsChangedDetail): void {
  window.dispatchEvent(new CustomEvent<DocumentsChangedDetail>(EVENT, { detail }));
}

export function onDocumentsChanged(handler: (detail: DocumentsChangedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<DocumentsChangedDetail>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
