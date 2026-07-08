import { useState, useEffect, useCallback } from 'react';
import { projectsApi, supervisorApi, techApi } from '../../../services/api';
import type { Project } from '../../../types';
import Modal from '../../../components/Modal';
import { useAppDialog } from '../../../components/AppDialogProvider';
import CompletionReport, { type CompletionReportData } from '../../../components/ui/CompletionReport';
import AssignTechnicianModal from '../../../components/assignment/AssignTechnicianModal';
import Toast from '../../../components/ui/Toast';
import OverflowActionMenu from '../../../components/ui/OverflowActionMenu';
import { TriangleAlert, CheckCircle, CheckCheck, RotateCcw, RefreshCw } from '../../../components/ui/icons';

type AssignmentView = 'assignments' | 'changeover';

interface AssignmentTabProps {
  projects: Project[];
  projectCode: string;
  panelId: string;
  selectedTechId?: string;
  initialView?: AssignmentView;
  onViewApplied?: () => void;
  onViewChange?: (view: AssignmentView) => void;
  /** Bumps when panels reload so assign modal refreshes */
  panelsRefreshKey?: number;
  /** Increment to open Assign modal from external controls */
  openAssignTick?: number;
  /** When true, hide changeover queue (lives in Review section) */
  assignmentsOnly?: boolean;
}

export default function AssignmentTab({
  projects,
  projectCode,
  panelId,
  selectedTechId = '',
  initialView = 'assignments',
  onViewApplied,
  onViewChange,
  panelsRefreshKey = 0,
  openAssignTick = 0,
  assignmentsOnly = false,
}: AssignmentTabProps) {
  const dialog = useAppDialog();
  const [view, setView] = useState<AssignmentView>(initialView);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showReview, setShowReview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasFrames, setHasFrames] = useState(false);

  const canAssign = Boolean(projectCode && panelId);

  useEffect(() => {
    if (assignmentsOnly) {
      setView('assignments');
      return;
    }
    setView(initialView);
    if (initialView === 'changeover') {
      onViewApplied?.();
    }
  }, [initialView, onViewApplied, assignmentsOnly]);

  useEffect(() => {
    onViewChange?.(view);
  }, [view, onViewChange]);

  useEffect(() => {
    if (openAssignTick <= 0) return;
    setView('assignments');
    if (canAssign) {
      setShowAssign(true);
    }
  }, [openAssignTick, canAssign]);

  const loadData = useCallback(() => {
    if (!projectCode) {
      setAssignments([]);
      setHasFrames(false);
      return;
    }
    setLoading(true);
    Promise.all([
      projectsApi.frames(projectCode),
      supervisorApi.allPanels(),
    ]).then(([fr, all]) => {
      setHasFrames(fr.length > 0);
      let forProject = all.filter((a: any) => a.project_code === projectCode);
      if (panelId) {
        forProject = forProject.filter((a: any) => a.frame_id === panelId);
      }
      const techId = selectedTechId ? parseInt(selectedTechId, 10) : null;
      setAssignments(
        techId != null && !Number.isNaN(techId)
          ? forProject.filter((a: any) => a.technician_id === techId)
          : forProject,
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectCode, panelId, selectedTechId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeassign = async (id: number) => {
    const ok = await dialog.confirm({
      title: 'Remove Assignment',
      message: 'Remove this assignment from the technician? This cannot be undone.',
      tone: 'delete',
      confirmText: 'Remove',
    });
    if (!ok) return;
    await techApi.delete(id).catch(() => {});
    loadData();
  };

  const assignmentStatus = (raw: string | null | undefined): { label: string; tone: 'done' | 'progress' | 'idle' | 'paused' } => {
    const status = String(raw || '').toLowerCase();
    if (status === 'completed') return { label: 'Completed', tone: 'done' };
    if (status === 'in_progress') return { label: 'In Progress', tone: 'progress' };
    if (status === 'paused') return { label: 'Paused', tone: 'paused' };
    return { label: status ? status.replace(/_/g, ' ') : 'Assigned', tone: 'idle' };
  };

  const submissionStatus = (assignment: any): { label: string; tone: 'done' | 'progress' | 'idle' } | null => {
    if (assignment.report_submitted) return { label: 'Submitted', tone: 'progress' };
    if (assignment.review_status === 'approved') return { label: 'Approved', tone: 'done' };
    if (assignment.review_status) return { label: String(assignment.review_status).replace(/_/g, ' '), tone: 'idle' };
    return null;
  };

  return (
    <div>
      <div className="ops-assignments-head">
        <div>
          <h3 className="ops-assignments-title">Active Assignments</h3>
          <p className="ops-assignments-sub">
            Panel ownership, KPI progress, and submission state for the selected scope.
          </p>
        </div>
        <div className="ops-assignments-head-actions">
          <button onClick={loadData} className="btn-secondary !h-10 !w-10 !px-0 shrink-0" type="button" title="Refresh assignments">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="nav-tab-panel min-w-0">
      <>
      {!projectCode && (
        <div className="empty-state">
          <p className="empty-text">Select a project above to view assignments.</p>
        </div>
      )}

      {projectCode && (
        <>
          {!panelId && (
            <div className="assignment-info-callout mb-4 flex items-start gap-1">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>Select a panel above to filter assignments or create a new assignment.</span>
            </div>
          )}

          {hasFrames === false && !loading && (
            <div className="assignment-warning mb-4 flex items-center gap-1">
              <TriangleAlert size={16} />
              <span>No frames uploaded for this project. Upload a wiring schedule first.</span>
            </div>
          )}

          {loading && <div className="empty-state"><p className="empty-text">Loading...</p></div>}

          {assignments.length === 0 && !loading && projectCode && hasFrames && (
            <div className="empty-state">
              {panelId ? 'No assignments yet for this panel.' : 'No assignments yet for this project.'}
            </div>
          )}

          <div className="ops-assignment-grid mt-4">
            {assignments.map(a => {
              const isCompleted = a.status === 'completed';
              const hasReport = a.report_submitted;
              const reviewDone = a.review_status && a.review_status !== 'rework';
              const primary = assignmentStatus(a.status);
              const secondary = submissionStatus(a);
              const secondaryActions = [
                (isCompleted || hasReport)
                  ? {
                      id: 'review',
                      label: 'Review Submission',
                      onClick: () => setShowReview(a),
                    }
                  : null,
                a.status === 'assigned'
                  ? {
                      id: 'remove',
                      label: 'Remove Assignment',
                      onClick: () => void handleDeassign(a.id),
                      destructive: true,
                    }
                  : null,
              ].filter(Boolean) as Array<{ id: string; label: string; onClick: () => void; destructive?: boolean }>;

              return (
                <div
                  key={a.id}
                  className={`ops-assignment-card ${isCompleted ? 'is-complete' : ''}`}
                >

                  <div className="ops-assignment-head">
                    <div className="min-w-0 pr-2">
                      <span className="ops-assignment-panel" title={a.panel_display_name || a.panel_name}>
                        {a.panel_display_name || a.panel_name}
                      </span>
                      <span className="ops-assignment-tech truncate">{a.technician_name}</span>
                    </div>
                    <div className="ops-assignment-kpi">
                      <span className="ops-assignment-kpi-value">{a.kpi ?? 0}%</span>
                      <span className="ops-assignment-kpi-label">KPI</span>
                    </div>
                  </div>

                  {(a.cables_total ?? 0) > 0 && (
                    <div className="ops-assignment-progress-wrap">
                      <progress
                        className="ops-assignment-progress"
                        value={a.kpi ?? 0}
                        max={100}
                      />
                    </div>
                  )}

                  <div className="ops-assignment-meta">
                    <span className={`ops-state-chip tone-${primary.tone}`}>{primary.label}</span>
                    {secondary && (
                      <span className={`ops-state-chip tone-${secondary.tone}`}>{secondary.label}</span>
                    )}
                    {!secondary && hasReport && !reviewDone && (
                      <span className="ops-state-chip tone-progress">Submitted</span>
                    )}
                    <span className="ops-cable-metric">
                      {a.cables_src_done ?? 0}/{a.cables_total ?? 0} src · {a.cables_dst_done ?? 0}/{a.cables_total ?? 0} dst
                    </span>
                  </div>

                  <div className="ops-assignment-actions">
                    <div className="text-[11px] text-slate-500 font-medium">
                      {a.changeover_locked ? 'Changeover locked' : 'Changeover available in queue'}
                    </div>

                    {secondaryActions.length > 0 && (
                      <OverflowActionMenu actions={secondaryActions} ariaLabel="Assignment actions" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {showAssign && (
            <AssignTechnicianModal
              projects={projects}
              initialProjectCode={projectCode}
              initialPanelId={panelId}
              onClose={() => setShowAssign(false)}
              onAssigned={loadData}
              panelsRefreshKey={panelsRefreshKey}
            />
          )}

          {toast && (
            <Toast message={toast} tone="success" onDismiss={() => setToast(null)} />
          )}

          {showReview && (
            <ReviewModal assignment={showReview} onClose={() => { setShowReview(null); loadData(); }} />
          )}
        </>
      )}
      </>
      </div>
    </div>
  );
}

// ── Review modal ─────────────────────────────────────────────────────────────

type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc';

function ReviewModal({ assignment, onClose }: { assignment: any; onClose: () => void }) {
  const [status, setStatus] = useState<ReviewStatus>('approved');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [report, setReport] = useState<CompletionReportData | null>(null);

  useEffect(() => {
    supervisorApi.completionReport(assignment.id).then(setReport).catch(() => {});
  }, [assignment.id]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await supervisorApi.review(assignment.id, status, notes);
      setDone(true);
    } catch (e: any) { setError(e?.response?.data?.message || 'Review failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title={`Review: ${assignment.panel_display_name || assignment.panel_name}`}
      onClose={onClose}
      footer={!done ? (
        <>
          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary" type="button">
            {saving ? 'Submitting…' : 'Submit Review'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="btn-primary" type="button">Close</button>
      )}
    >
      {done ? (
        <div className="assignment-success-wrap">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
          <div className="assignment-success-title">Review submitted</div>
          <div className="assignment-success-note mt-2">
            Status set to <strong>{status}</strong> for {assignment.technician_name}.
          </div>
        </div>
      ) : (
        <>
          {report ? (
            <div className="mb-4">
              <CompletionReport data={report} compact />
            </div>
          ) : (
            <div className="mb-4 p-3 bg-slate-50 border border-[#E2E8F0] rounded-[8px] text-[13px]">
              <div className="font-medium text-slate-700">{assignment.technician_name}</div>
              <div className="text-slate-500 mt-0.5">KPI: {assignment.kpi ?? 0}% · {assignment.cables_total ?? 0} cables</div>
            </div>
          )}

          <div className="mb-4">
            <label className="form-label mb-2">Review Decision</label>
            <div className="flex flex-col gap-2">
              {(['approved', 'ready_for_qc', 'rework'] as ReviewStatus[]).map(s => (
                <label key={s} className={`flex items-center gap-3 p-3 rounded-[8px] border cursor-pointer transition-colors ${
                  status === s
                    ? s === 'approved' ? 'bg-green-50 border-green-400' : s === 'rework' ? 'bg-red-50 border-red-400' : 'bg-blue-50 border-blue-400'
                    : 'bg-white border-[#E2E8F0] hover:bg-slate-50'
                }`}>
                  <input type="radio" name="review_status" value={s} checked={status === s} onChange={() => setStatus(s)} className="accent-blue-600" />
                  <span className="text-[13px] font-medium text-slate-800 capitalize">
                    {s === 'ready_for_qc' ? 'Send to QA/QC' : s === 'rework' ? 'Request Rework' : 'Approve'}
                  </span>
                  {s === 'approved' && <CheckCheck size={14} className="ml-auto text-green-600" />}
                  {s === 'rework'   && <RotateCcw size={14} className="ml-auto text-red-500" />}
                </label>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={status === 'rework' ? 'Describe the rework required…' : 'Add review notes…'}
              className="w-full text-[14px] border border-[#E2E8F0] rounded-[10px] bg-slate-50 focus:bg-white focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/12 outline-none transition-all placeholder-slate-400 p-3 resize-none"
            />
          </div>

          {error && <div className="form-error mt-2">{error}</div>}
        </>
      )}
    </Modal>
  );
}
