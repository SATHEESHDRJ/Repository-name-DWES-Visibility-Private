/** Cross-tab signal when assignments, workflow status, or inspections change. */

export type WorkflowChangedScope =
  | 'assignment'
  | 'inspection'
  | 'wiring'
  | 'approval'
  | 'general';

export interface WorkflowChangedDetail {
  scope?: WorkflowChangedScope;
  projectCode?: string;
  frameId?: string;
  assignmentId?: number;
  cableIndex?: number;
  wireId?: string;
  previousWireId?: string;
  nextWireId?: string;
  nextCableIndex?: number;
}

const EVENT = 'dwes:workflow-changed';

export function emitWorkflowChanged(detail: WorkflowChangedDetail = {}): void {
  window.dispatchEvent(new CustomEvent<WorkflowChangedDetail>(EVENT, { detail }));
}

export function onWorkflowChanged(handler: (detail: WorkflowChangedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<WorkflowChangedDetail>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
