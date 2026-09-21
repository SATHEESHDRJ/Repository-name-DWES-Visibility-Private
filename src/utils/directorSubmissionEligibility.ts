import { QA_QC_WORKFLOW_ENABLED } from '../config/features';

export type DirectorSubmitPanelView = {
  cables_total?: number | null;
  cables_completed?: number | null;
  cables_remaining?: number | null;
  status?: string | null;
  completed_at?: string | null;
  review_status?: string | null;
  director_submitted?: boolean | null;
  open_end_source?: number | null;
  open_end_destination?: number | null;
};

export function isPanelEligibleForDirectorSubmit(panel: DirectorSubmitPanelView | null | undefined): boolean {
  if (!panel) return false;
  const total = panel.cables_total ?? 0;
  const completed = panel.cables_completed ?? 0;
  const remaining = panel.cables_remaining ?? Math.max(0, total - completed);
  if (total <= 0 || completed !== total || remaining !== 0) return false;
  if (panel.status !== 'completed' && !panel.completed_at) return false;
  if (QA_QC_WORKFLOW_ENABLED) {
    if (panel.review_status === 'ready_for_qc' || panel.review_status === 'rework') return false;
  }
  return true;
}

export function isPanelSubmittedToDirector(panel: DirectorSubmitPanelView | null | undefined): boolean {
  return Boolean(panel?.director_submitted);
}
