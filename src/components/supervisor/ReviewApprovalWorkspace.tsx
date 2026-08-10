import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, FileText, CheckSquare, Check, X, SendHorizonal,
  ArrowRight, ArrowLeftRight, Pencil, MessageCircle, PanelTop,
  Building2, LayoutGrid, CheckCircle2, User,
} from '../ui/icons';
import Modal from '../Modal';
import ReportPreviewModal from '../ui/ReportPreviewModal';
import { useAppDialog } from '../AppDialogProvider';
import { useDwesRefresh, type RefreshOptions } from '../../hooks/useDwesRefresh';
import { projectsApi, supervisorApi } from '../../services/api';
import type { Project, PanelActivityData } from '../../types';
import { DwesLoadingState, DwesLoadingIndicator } from '../ui/DwesLoadingIndicator';
import { compactPanelDisplayName, projectSelectLabel, resolveProjectCardDetails } from '../../utils/projectDisplay';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import { emitWorkflowChanged, onWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { useProjectSelectionStore } from '../../store/useProjectSelectionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { resolveSelectedPanelId } from '../../utils/panelSelection';
import { formatDuration } from '../technician/wiring/wiring-utils';
import WorkspaceSectionHeading from '../ui/WorkspaceSectionHeading';
import { WorkspaceInfoMatrix, WorkspaceInfoCell } from '../ui/WorkspaceInfoMatrix';
import { QA_QC_WORKFLOW_ENABLED } from '../../config/features';
import {
  isPanelEligibleForDirectorSubmit,
  isPanelSubmittedToDirector,
} from '../../utils/directorSubmissionEligibility';

type PanelState = 'completed' | 'ready_for_qc' | 'in_progress' | 'paused' | 'assigned' | 'unassigned' | 'pending_approval';
type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc';

const STATE_META: Record<PanelState, { label: string; pill: string }> = {
  completed: { label: 'Completed', pill: 'bg-green-100 text-green-700 border border-green-200' },
  in_progress: { label: 'In Progress', pill: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
  ready_for_qc: { label: 'QA/QC Review', pill: 'bg-violet-100 text-violet-800 border border-violet-200' },
  paused: { label: 'Paused', pill: 'bg-slate-100 text-secondary border border-slate-200' },
  assigned: { label: 'Assigned', pill: 'bg-blue-100 text-blue-700 border border-blue-200' },
  pending_approval: { label: 'Pending Approval', pill: 'bg-orange-100 text-orange-800 border border-orange-200' },
  unassigned: { label: 'Not Assigned', pill: 'bg-red-50 text-red-700 border border-red-200' },
};

/** Authoritative live-status badge tones (mirrors panel-activity status keys). */
const LIVE_TONES: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  paused: 'bg-amber-50 text-amber-800 border-amber-300',
  lunch_break: 'bg-amber-50 text-amber-800 border-amber-300',
  tea_break: 'bg-amber-50 text-amber-800 border-amber-300',
  logged_out: 'bg-slate-100 text-secondary border-slate-300',
  assigned: 'bg-slate-100 text-secondary border-slate-300',
};

interface PanelRow {
  key: string;
  frameId: string;
  projectCode: string;
  panelName: string;
  technician: string;
  technicianUsername: string;
  assignmentId: number | null;
  state: PanelState;
  progress: number;
  reviewStatus: string | null;
  reviewNotes: string;
  reviewerName: string;
  approverName: string;
  reworkByName: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  reworkRequestedAt: string | null;
  reworkReason: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  activeSeconds: number;
  reportSubmitted: boolean;
  needsLegacyApproval: boolean;
  cablesTotal: number;
  cablesCompleted: number;
  cablesRemaining: number;
  hasWiring: boolean;
  directorSubmitted: boolean;
  directorSubmittedAt: string | null;
  directorSubmittedBy: string | null;
  openEndSource: number;
  openEndDestination: number;
}

function effectiveState(a: any | undefined): PanelState {
  if (!a) return 'unassigned';
  if (a.status === 'assigned' && a.supervisor_approved === false && !a.rework_requested) {
    return 'pending_approval';
  }
  if (a.status === 'completed') {
    if (a.review_status === 'ready_for_qc') return 'ready_for_qc';
    return 'completed';
  }
  if (a.status === 'paused') return 'paused';
  if (a.status === 'in_progress') return 'in_progress';
  return 'assigned';
}

/** Workflow state for Review & Approval — same authoritative fields the backend gates on. */
function approvalState(
  row: PanelRow | null,
  projectState: string | undefined,
): { label: string; tone: 'muted' | 'info' | 'warn' | 'ok' | 'done' } {
  if (projectState === 'submitted_to_director') return { label: 'Submitted to Director', tone: 'done' };
  if (!row) return { label: '—', tone: 'muted' };
  if (row.reviewStatus === 'approved') return { label: 'Approved', tone: 'ok' };
  if (row.reviewStatus === 'rework') return { label: 'Rework Required', tone: 'warn' };
  if (row.reviewStatus === 'ready_for_qc') return { label: 'Sent to QA/QC', tone: 'info' };
  if (row.state === 'completed') return { label: 'Pending Review', tone: 'info' };
  if (row.needsLegacyApproval) return { label: 'Pending Approval', tone: 'warn' };
  if (row.state === 'unassigned') return { label: 'Not Assigned', tone: 'muted' };
  return { label: 'In Progress', tone: 'info' };
}

function projectDisplayTitle(project: Project): string {
  const d = resolveProjectCardDetails(project);
  return d.client && d.client !== 'Not set'
    ? `${d.substationName} · ${d.client}`
    : d.substationName;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

export default function ReviewApprovalWorkspace({ isActive = true }: { isActive?: boolean }) {
  const dialog = useAppDialog();
  const { user } = useAuthStore();
  const sessionCode = useProjectSelectionStore(s => s.selectedProject?.code ?? null);
  const setSessionProject = useProjectSelectionStore(s => s.setProjectForUser);
  const selectedPanelByProject = useProjectSelectionStore(s => s.selectedPanelByProject);
  const setSelectedPanelForProject = useProjectSelectionStore(s => s.setSelectedPanelForProject);

  const [projects, setProjects] = useState<Project[]>([]);
  const [frames, setFrames] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedFrameId, setSelectedFrameId] = useState<string>('');

  const [activity, setActivity] = useState<PanelActivityData | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');

  const [reportPanel, setReportPanel] = useState<PanelRow | null>(null);
  const [reviewPanel, setReviewPanel] = useState<PanelRow | null>(null);
  const [reworkPanel, setReworkPanel] = useState<PanelRow | null>(null);

  const requests = useLatestRequest();
  const activityRequests = useLatestRequest();

  const loadWorkspaceData = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = requests.begin();
    if (!silent) {
      setLoading(true);
      setProjects([]);
      setFrames([]);
      setAssignments([]);
    }
    try {
      const projs = await projectsApi.list(request.signal) as Project[];
      const [frameLists, panelAssignments] = await Promise.all([
        Promise.all(
          projs.map((p: Project) =>
            projectsApi.frames(p.code, request.signal)
              .then(fs => fs.map((f: any) => ({ ...f, project_code: p.code }))),
          ),
        ),
        supervisorApi.allPanels(request.signal),
      ]);
      if (!requests.isLatest(request.id)) return;
      setProjects(projs);
      setFrames(frameLists.flat());
      setAssignments(panelAssignments);
      setLastRefreshed(new Date());
    } catch (error: any) {
      if (!silent && error?.code !== 'ERR_CANCELED' && requests.isLatest(request.id)) {
        setProjects([]);
        setFrames([]);
        setAssignments([]);
      }
    } finally {
      if (!silent && requests.isLatest(request.id)) setLoading(false);
    }
  }, [requests]);

  useEffect(() => {
    if (!isActive) return;
    void loadWorkspaceData();
  }, [isActive, loadWorkspaceData]);

  useDwesRefresh(options => {
    if (!isActive) return;
    return loadWorkspaceData(options);
  }, { enabled: isActive });

  useEffect(() => {
    return onFramesChanged((detail) => {
      if (detail.action === 'deleted') requests.cancel();
      if (detail.action === 'deleted' && !detail.frameId) {
        setProjects(prev => prev.filter(project => project.code !== detail.projectCode));
        setFrames(prev => prev.filter(frame => frame.project_code !== detail.projectCode));
        setAssignments(prev => prev.filter(assignment => assignment.project_code !== detail.projectCode));
      } else if (detail.action === 'deleted' && detail.frameId) {
        setFrames(prev => prev.filter(f => !(f.project_code === detail.projectCode && f.id === detail.frameId)));
        setAssignments(prev => prev.filter(a => !(a.project_code === detail.projectCode && a.frame_id === detail.frameId)));
      }
    });
  }, [requests]);

  const projectMap = useMemo(() => new Map(projects.map(p => [p.code, p])), [projects]);

  const assignmentByFrame = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of assignments) {
      const prev = m.get(a.frame_id);
      if (!prev || (a.id ?? 0) > (prev.id ?? 0)) m.set(a.frame_id, a);
    }
    return m;
  }, [assignments]);

  const rowFor = useCallback((f: any): PanelRow => {
    const a = assignmentByFrame.get(f.id);
    const state = effectiveState(a);
    return {
      key: `${f.project_code}:${f.id}`,
      frameId: f.id,
      projectCode: f.project_code,
      panelName: a?.panel_display_name || f.panel_name || f.id,
      technician: a?.technician_name || a?.technician_username || '—',
      technicianUsername: a?.technician_username || '',
      assignmentId: a?.id ?? null,
      state,
      progress: a?.kpi ?? 0,
      reviewStatus: a?.review_status ?? null,
      reviewNotes: a?.review_notes || '',
      reviewerName: a?.reviewer_name || '',
      approverName: a?.approver_name || '',
      reworkByName: a?.rework_by_name || '',
      reviewedAt: a?.reviewed_at ?? null,
      approvedAt: a?.approved_at ?? null,
      reworkRequestedAt: a?.rework_requested_at ?? null,
      reworkReason: a?.rework_reason || '',
      assignedAt: a?.assigned_at ?? null,
      startedAt: a?.started_at ?? null,
      completedAt: a?.completed_at ?? null,
      activeSeconds: a?.total_wiring_seconds ?? 0,
      reportSubmitted: Boolean(a?.report_submitted),
      needsLegacyApproval: Boolean(a?.status === 'assigned' && a?.supervisor_approved === false && !a?.rework_requested),
      cablesTotal: a?.cables_total ?? f.cable_count ?? 0,
      cablesCompleted: a?.cables_completed ?? 0,
      cablesRemaining: a?.cables_remaining ?? Math.max(0, (a?.cables_total ?? f.cable_count ?? 0) - (a?.cables_completed ?? 0)),
      hasWiring: (f.cable_count ?? 0) > 0,
      directorSubmitted: Boolean(a?.director_submitted),
      directorSubmittedAt: a?.director_submitted_at ?? null,
      directorSubmittedBy: a?.director_submitted_by ?? null,
      openEndSource: a?.open_end_source ?? 0,
      openEndDestination: a?.open_end_destination ?? 0,
    };
  }, [assignmentByFrame]);

  // Keep the selected project aligned with the session project / available projects.
  useEffect(() => {
    if (loading || projects.length === 0) return;
    setSelectedCode(prev => {
      if (prev && projectMap.has(prev)) return prev;
      if (sessionCode && projectMap.has(sessionCode)) return sessionCode;
      return projects[0].code;
    });
  }, [loading, projects, projectMap, sessionCode]);

  const selectedProject = selectedCode ? projectMap.get(selectedCode) ?? null : null;

  const projectPanels: PanelRow[] = useMemo(
    () => frames
      .filter(f => f.project_code === selectedCode)
      .map(rowFor)
      .sort((a, b) => compactPanelDisplayName(a.panelName).localeCompare(compactPanelDisplayName(b.panelName))),
    [frames, selectedCode, rowFor],
  );

  // Restore the panel the supervisor last selected for THIS project (survives the
  // tab remount). Stored panels that no longer exist fall back to the first panel;
  // a panel is never carried across projects.
  useEffect(() => {
    setSelectedFrameId(prev => {
      if (prev && projectPanels.some(p => p.frameId === prev)) return prev;
      return resolveSelectedPanelId(
        selectedPanelByProject[selectedCode],
        projectPanels.map(p => p.frameId),
      );
    });
  }, [projectPanels, selectedCode, selectedPanelByProject]);

  const handlePanelChange = useCallback((panelId: string) => {
    setSelectedFrameId(panelId);
    if (selectedCode) setSelectedPanelForProject(selectedCode, panelId);
  }, [selectedCode, setSelectedPanelForProject]);

  const handleProjectChange = (code: string) => {
    setSelectedCode(code);
    const targetPanelIds = frames
      .filter(f => f.project_code === code)
      .map(rowFor)
      .sort((a, b) => compactPanelDisplayName(a.panelName).localeCompare(compactPanelDisplayName(b.panelName)))
      .map(p => p.frameId);
    setSelectedFrameId(resolveSelectedPanelId(selectedPanelByProject[code], targetPanelIds));
    const project = projectMap.get(code);
    if (project && user?.id) {
      setSessionProject({
        code: project.code,
        name: project.name,
        client: project.client,
        project_state: project.project_state,
        is_active: project.is_active,
      }, user.id);
    }
  };

  const selectedRow = projectPanels.find(p => p.frameId === selectedFrameId) ?? null;

  // Live technician activity for the selected panel (authoritative backend status).
  const reloadActivity = useCallback((code: string, frameId: string, opts?: { silent?: boolean }) => {
    const request = activityRequests.begin();
    if (!opts?.silent) setActivityLoading(true);
    setActivityError('');
    return supervisorApi.panelActivity(code, frameId, request.signal)
      .then((data: any) => {
        if (!activityRequests.isLatest(request.id)) return;
        setActivity(data as PanelActivityData);
      })
      .catch((err: any) => {
        if (err?.code === 'ERR_CANCELED' || !activityRequests.isLatest(request.id)) return;
        setActivity(null);
        setActivityError('Technician activity could not be loaded.');
      })
      .finally(() => {
        if (activityRequests.isLatest(request.id)) setActivityLoading(false);
      });
  }, [activityRequests]);

  useEffect(() => {
    if (!isActive || !selectedCode || !selectedFrameId) {
      activityRequests.cancel();
      setActivity(null);
      setActivityLoading(false);
      setActivityError('');
      return;
    }
    const code = selectedCode;
    const frameId = selectedFrameId;
    void reloadActivity(code, frameId);
    const timer = window.setInterval(() => void reloadActivity(code, frameId, { silent: true }), 12_000);
    const unsubscribe = onWorkflowChanged(detail => {
      if (detail.projectCode && detail.projectCode !== code) return;
      if (detail.frameId && detail.frameId !== frameId) return;
      void reloadActivity(code, frameId, { silent: true });
    });
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      activityRequests.cancel();
    };
  }, [isActive, selectedCode, selectedFrameId, reloadActivity, activityRequests]);

  const selectedAssignment = selectedRow ? assignmentByFrame.get(selectedRow.frameId) : null;
  const canSubmitSelectedPanel = selectedRow != null
    && selectedProject != null
    && isPanelEligibleForDirectorSubmit(selectedAssignment ?? selectedRow)
    && !isPanelSubmittedToDirector(selectedAssignment ?? selectedRow);

  const completedPanels = projectPanels.filter(p => p.state === 'completed' || p.state === 'ready_for_qc');
  const canSubmitToDirector = QA_QC_WORKFLOW_ENABLED
    ? (selectedProject != null
      && completedPanels.length > 0
      && !completedPanels.some(p => p.reviewStatus === 'ready_for_qc')
      && !completedPanels.some(p => p.reviewStatus === 'rework')
      && selectedProject.project_state !== 'submitted_to_director')
    : canSubmitSelectedPanel;

  const handleApproveLegacy = async (id: number) => {
    setSaving(true);
    setActionError('');
    try {
      await supervisorApi.approve(id);
      emitWorkflowChanged({ scope: 'approval' });
      await loadWorkspaceData({ silent: true });
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'Approval failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToDirector = async () => {
    if (!selectedProject || !selectedRow) return;
    const completionTime = activity?.completed_at
      || selectedRow.completedAt
      || selectedAssignment?.completed_at
      || null;
    const total = selectedAssignment?.cables_total ?? selectedRow.cablesTotal;
    const completed = selectedAssignment?.cables_completed ?? selectedRow.cablesCompleted;
    const openSrc = selectedAssignment?.open_end_source ?? selectedRow.openEndSource;
    const openDst = selectedAssignment?.open_end_destination ?? selectedRow.openEndDestination;
    const ok = await dialog.confirm({
      title: 'Submit to Director',
      message: 'Confirm submission of this completed panel to the Operations Director.',
      confirmText: 'Submit',
      tone: 'save',
      actionSummary: QA_QC_WORKFLOW_ENABLED
        ? 'Submit only after every completed panel is approved.'
        : 'This publishes the panel report to the Director register (read-only).',
      entity: {
        label: 'Project · Panel',
        value: `${projectDisplayTitle(selectedProject)} · ${compactPanelDisplayName(selectedRow.panelName)}`,
        meta: selectedProject.code,
        kind: 'project',
      },
      counts: [
        { label: 'Technician', value: selectedRow.technician },
        { label: 'Total', value: total },
        { label: 'Completed', value: completed },
        { label: 'Open-end src/dst', value: `${openSrc} / ${openDst}` },
        { label: 'Completion time', value: completionTime ? formatDateTime(completionTime) : '—' },
      ],
    });
    if (!ok) return;
    setSaving(true);
    setActionError('');
    try {
      await projectsApi.submitToDirector(selectedProject.code, {
        frameId: selectedRow.frameId,
        assignmentId: selectedRow.assignmentId ?? undefined,
      });
      emitWorkflowChanged({ scope: 'general', projectCode: selectedProject.code, frameId: selectedRow.frameId });
      await loadWorkspaceData({ silent: true });
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <DwesLoadingState label="Loading status workspace…" />;
  }

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-text">No projects available yet.</p>
      </div>
    );
  }

  const isCompleted = activity?.is_completed ?? (selectedRow?.state === 'completed' || selectedRow?.state === 'ready_for_qc');
  const canOpenReport = selectedRow != null && (selectedRow.assignmentId != null || selectedRow.hasWiring);
  const REPORT_UNAVAILABLE_TOOLTIP = 'Upload a wiring schedule or assign a technician first';
  const reviewState = approvalState(selectedRow, selectedProject?.project_state);
  const liveTone = LIVE_TONES[activity?.status ?? ''] ?? 'bg-slate-100 text-secondary border-slate-300';
  const midChange = activity?.mid_change?.occurred ? activity.mid_change : null;
  const loggedOut = Boolean((activity as unknown as Record<string, unknown> | null)?.['technician_logged_out']);
  const activeSeconds = Number((activity as unknown as Record<string, unknown> | null)?.['active_seconds'] ?? selectedRow?.activeSeconds ?? 0);

  return (
    <div className="sup-status">
      {/* ── A+B: Compact header with inline project/panel selection ───────── */}
      <header className="sup-status-topbar">
        <div className="sup-status-title">
          <WorkspaceSectionHeading
            title="Status Workspace"
            subtitle="Live panel execution, technician activity, reports, and approval."
            icon={<PanelTop size={16} strokeWidth={1.75} />}
          />
        </div>
        <div className="sup-status-selectors">
          <label htmlFor="sup-status-project" className="sr-only">Project</label>
          <select
            id="sup-status-project"
            className="pj-project-select sup-status-select"
            value={selectedCode}
            onChange={e => handleProjectChange(e.target.value)}
            title="Project"
          >
            {projects.map(p => (
              <option key={p.code} value={p.code}>{projectSelectLabel(p)}</option>
            ))}
          </select>
          <label htmlFor="sup-status-panel" className="sr-only">Panel</label>
          <select
            id="sup-status-panel"
            className="pj-panel-select sup-status-select"
            value={selectedFrameId}
            onChange={e => handlePanelChange(e.target.value)}
            disabled={projectPanels.length === 0}
            title="Panel"
          >
            <option value="">{projectPanels.length === 0 ? 'No panels in this project' : 'Select a panel…'}</option>
            {projectPanels.map(p => (
              <option key={p.frameId} value={p.frameId}>{compactPanelDisplayName(p.panelName)}</option>
            ))}
          </select>
          {lastRefreshed && (
            <span className="sup-status-refreshed text-muted" title={lastRefreshed.toLocaleString()}>
              Updated {formatClock(lastRefreshed)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadWorkspaceData({ silent: true })}
            className="btn-secondary !h-9 !w-9 !px-0 shrink-0"
            title="Refresh status"
            aria-label="Refresh status"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {actionError && <div className="form-error col-span-12">{actionError}</div>}

      {!selectedRow ? (
        <div className="empty-state col-span-12">
          <p className="empty-text">
            {projectPanels.length === 0 ? 'This project has no panels yet.' : 'Select a panel to view its live status.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── C: Panel Overview (8 cols) ──────────────────────────────────── */}
          <section className="sup-overview" aria-label="Panel overview">
            <header className="sup-overview-head">
              <div className="sup-overview-titles">
                <Building2 size={14} className="text-muted shrink-0" aria-hidden />
                <span className="truncate text-muted text-[12px] font-semibold" title={selectedProject ? projectDisplayTitle(selectedProject) : ''}>
                  {selectedProject ? projectDisplayTitle(selectedProject) : selectedCode}
                </span>
                <PanelTop size={15} className="shrink-0" aria-hidden />
                <span className="truncate" title={selectedRow.panelName}>{compactPanelDisplayName(selectedRow.panelName)}</span>
              </div>
              {/* The ONE authoritative live-status badge for the selected panel. */}
              <span className={`sup-live-badge ${liveTone}`} data-live-status>
                {activityLoading && !activity ? 'Checking…' : activity?.status_label ?? STATE_META[selectedRow.state].label}
              </span>
            </header>

            <WorkspaceInfoMatrix className="sup-overview-grid px-4 pb-2" aria-label="Panel summary">
              <WorkspaceInfoCell label="Assignment" value={selectedRow.assignmentId ? 'Assigned' : 'Not Assigned'} />
              <WorkspaceInfoCell label="Technician" emphasis="primary" title={selectedRow.technician}>
                {selectedRow.technician}
                {selectedRow.technicianUsername ? ` @${selectedRow.technicianUsername}` : ''}
              </WorkspaceInfoCell>
              <WorkspaceInfoCell label="Total" emphasis="default">
                <span className="tabular-nums">{selectedRow.cablesTotal}</span>
              </WorkspaceInfoCell>
              <WorkspaceInfoCell label="Completed" emphasis="default">
                <span className="tabular-nums">{selectedRow.cablesCompleted}</span>
              </WorkspaceInfoCell>
              <WorkspaceInfoCell label="Remaining" emphasis="default">
                <span className="tabular-nums">{selectedRow.cablesRemaining}</span>
              </WorkspaceInfoCell>
              <WorkspaceInfoCell label="Progress" emphasis="primary">
                <span className="tabular-nums">{selectedRow.progress}%</span>
              </WorkspaceInfoCell>
            </WorkspaceInfoMatrix>

            <div className="sup-overview-foot">
              <div className="sup-overview-progress" role="progressbar" aria-valuenow={selectedRow.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="sup-overview-progress-fill" style={{ width: `${selectedRow.progress}%` }} />
              </div>
              <p className="sup-overview-wiring text-muted">
                <LayoutGrid size={12} aria-hidden />
                {selectedRow.hasWiring ? 'Wiring schedule uploaded' : 'No wiring schedule uploaded'}
              </p>
            </div>
          </section>

          {/* ── D: Technician Activity (4 cols) ─────────────────────────────── */}
          <section className="sup-tech-activity" aria-label="Technician activity">
            <div className="sup-tech-head">
              <span className="flex items-center gap-2">
                <User size={15} className="sup-section-head-icon" aria-hidden /> Technician Activity
              </span>
            </div>
            <div className="sup-tech-body">
            {activityError && !activity ? (
              <p className="form-error">{activityError}</p>
            ) : !activity ? (
              activityLoading ? (
                <div className="py-2 flex justify-center">
                  <DwesLoadingIndicator label="Loading activity…" size="sm" />
                </div>
              ) : (
                <p className="text-muted text-[12px]">No technician assigned to this panel.</p>
              )
            ) : (
              <div className="sup-activity">
                <div className="sup-activity-row">
                  <span className="sup-overview-label text-muted">Technician</span>
                  <span className="text-value truncate">
                    {activity.technician?.name}
                    {activity.technician?.username && <span className="text-muted"> @{activity.technician.username}</span>}
                    {loggedOut && (
                      <span className="sup-activity-offline" title="Technician is currently logged out of DWES"> Offline</span>
                    )}
                  </span>
                </div>
                <div className="sup-activity-row">
                  <span className="sup-overview-label text-muted">Assigned</span>
                  <span className="text-value">{formatDateTime(activity.assigned_at)}</span>
                </div>
                <div className="sup-activity-row">
                  <span className="sup-overview-label text-muted">Started</span>
                  <span className="text-value">{formatDateTime(activity.wiring_started_at)}</span>
                </div>
                <div className="sup-activity-row">
                  <span className="sup-overview-label text-muted">Last activity</span>
                  <span className="text-value">{formatDateTime(activity.last_activity_at)}</span>
                </div>
                <div className="sup-activity-row">
                  <span className="sup-overview-label text-muted">Work state</span>
                  <span className="text-value">{activity.work_state_label}</span>
                </div>
                <div className="sup-activity-row">
                  <span className="sup-overview-label text-muted">Active duration</span>
                  <span className="text-value">{activeSeconds > 0 ? formatDuration(activeSeconds) : '—'}</span>
                </div>
                {activity.pause_reason && (
                  <p className="sup-activity-pause">Paused — {activity.pause_reason}</p>
                )}
                <div className="sup-activity-row">
                  <span className="sup-overview-label text-muted">Current contributor</span>
                  <span className="text-value truncate">{activity.technician?.name ?? '—'}</span>
                </div>
                {midChange && (
                  <details className="sup-midchange">
                    <summary className="sup-midchange-summary">
                      <ArrowLeftRight size={12} aria-hidden /> Mid Change history
                    </summary>
                    <div className="sup-midchange-body">
                      <p className="text-muted text-[11px] m-0">Changed {formatDateTime(midChange.changed_at)}</p>
                      <div className="sup-midchange-flow">
                        <div className="sup-midchange-card">
                          <span className="sup-overview-label text-muted">Original</span>
                          <span className="text-value truncate">{midChange.original_technician.name}</span>
                          <span className="text-muted text-[11px]">{midChange.original_technician.cables_completed} cables</span>
                        </div>
                        <ArrowRight size={14} className="text-muted shrink-0" aria-hidden />
                        <div className="sup-midchange-card is-incoming">
                          <span className="sup-overview-label text-muted">Incoming</span>
                          <span className="text-value truncate">{midChange.incoming_technician.name}</span>
                          <span className="text-muted text-[11px]">{midChange.incoming_technician.cables_completed} cables</span>
                        </div>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            )}
            </div>
          </section>

          {/* ── E: Reports (7 cols) ─────────────────────────────────────────── */}
          <section className="sup-reports-card" aria-label="Reports">
            <div className="sup-reports-head">
              <span className="flex items-center gap-2"><FileText size={15} className="sup-section-head-icon" aria-hidden /> Reports</span>
            </div>
            <div className="sup-reports-body">

            <div className="sup-report-row">
              <div className="min-w-0 flex-1">
                <span className="text-value-strong text-[12.5px] block truncate">
                  Panel Report — {compactPanelDisplayName(selectedRow.panelName)}
                </span>
                <span className="text-muted text-[11px]">
                  {isCompleted ? 'Finalized, read-only · non-editable PDF' : 'Read-only · refreshes as work is recorded'}
                </span>
              </div>
              <div className="sup-report-actions">
                <button
                  type="button"
                  className="sup-btn-compact dwes-report-action-btn"
                  disabled={!canOpenReport}
                  title={!canOpenReport ? REPORT_UNAVAILABLE_TOOLTIP : undefined}
                  onClick={() => setReportPanel(selectedRow)}
                >
                  <FileText size={13} /> View Report
                </button>
              </div>
            </div>

            {projectPanels.filter(p => p.frameId !== selectedFrameId).length > 0 && (
              <ul className="sup-report-list" aria-label="Other panel reports">
                {projectPanels.filter(p => p.frameId !== selectedFrameId).map(p => {
                  const canReport = p.assignmentId != null || p.hasWiring;
                  return (
                    <li key={p.key} className="sup-report-list-row">
                      <button type="button" className="sup-report-panel text-value" onClick={() => handlePanelChange(p.frameId)} title={p.panelName}>
                        {compactPanelDisplayName(p.panelName)}
                      </button>
                      <span className={`sup-panels-pill ${STATE_META[p.state].pill}`}>{STATE_META[p.state].label}</span>
                      <button
                        type="button"
                        className="sup-panels-report dwes-report-action-btn"
                        disabled={!canReport}
                        onClick={() => setReportPanel(p)}
                        title={canReport ? 'View report' : REPORT_UNAVAILABLE_TOOLTIP}
                      >
                        <FileText size={12} /> View Report
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            </div>
          </section>

          {/* ── F: Director Submission or QA/QC Review ─────────────────────── */}
          {QA_QC_WORKFLOW_ENABLED ? (
          <section className="sup-review-card" aria-label="Review and Approval">
            <div className="sup-review-head">
              <span className="flex items-center gap-2"><CheckSquare size={15} className="sup-section-head-icon" aria-hidden /> Review &amp; Approval</span>
              <span className={`sup-review-state sup-review-state--${reviewState.tone}`}>{reviewState.label}</span>
            </div>
            <div className="sup-review-body">

            <div className="sup-review-facts">
              <div className="sup-activity-row">
                <span className="sup-overview-label text-muted">Reviewer</span>
                <span className="text-value truncate">
                  {selectedRow.reviewerName || '—'}
                  {selectedRow.reviewedAt && <span className="text-muted text-[11px]"> · {formatDateTime(selectedRow.reviewedAt)}</span>}
                </span>
              </div>
              <div className="sup-activity-row">
                <span className="sup-overview-label text-muted">Approver</span>
                <span className="text-value truncate">
                  {selectedRow.approverName || '—'}
                  {selectedRow.approvedAt && <span className="text-muted text-[11px]"> · {formatDateTime(selectedRow.approvedAt)}</span>}
                </span>
              </div>
            </div>

            <details className="sup-audit">
              <summary className="sup-audit-summary">Audit history</summary>
              <ul className="sup-audit-list">
                <li><span className="text-muted">Assigned</span> <span className="text-value">{formatDateTime(selectedRow.assignedAt)}</span></li>
                <li><span className="text-muted">Started</span> <span className="text-value">{formatDateTime(selectedRow.startedAt)}</span></li>
                {selectedRow.completedAt && (
                  <li><span className="text-muted">Completed</span> <span className="text-value">{formatDateTime(selectedRow.completedAt)}</span></li>
                )}
                {selectedRow.reworkRequestedAt && (
                  <li>
                    <span className="text-muted">Rework requested{selectedRow.reworkByName ? ` by ${selectedRow.reworkByName}` : ''}</span>{' '}
                    <span className="text-value">{formatDateTime(selectedRow.reworkRequestedAt)}</span>
                    {selectedRow.reworkReason && <p className="sup-audit-note text-muted">“{selectedRow.reworkReason}”</p>}
                  </li>
                )}
                {selectedRow.reviewedAt && (
                  <li>
                    <span className="text-muted">Reviewed{selectedRow.reviewerName ? ` by ${selectedRow.reviewerName}` : ''}</span>{' '}
                    <span className="text-value">{formatDateTime(selectedRow.reviewedAt)} — {selectedRow.reviewStatus?.replace(/_/g, ' ')}</span>
                    {selectedRow.reviewNotes && <p className="sup-audit-note text-muted">“{selectedRow.reviewNotes}”</p>}
                  </li>
                )}
                {selectedRow.approvedAt && (
                  <li><span className="text-muted">Approved{selectedRow.approverName ? ` by ${selectedRow.approverName}` : ''}</span> <span className="text-value">{formatDateTime(selectedRow.approvedAt)}</span></li>
                )}
                {selectedProject?.project_state === 'submitted_to_director' && (
                  <li><span className="text-muted">Submitted to Director</span> <span className="text-value"><CheckCircle2 size={12} className="inline text-emerald-600" /></span></li>
                )}
              </ul>
            </details>

            <div className="sup-review-actions">
              {selectedRow.needsLegacyApproval && selectedRow.assignmentId != null && (
                <>
                  <button type="button" className="sup-btn-compact sup-btn-compact-danger" disabled={saving} onClick={() => setReworkPanel(selectedRow)}>
                    <X size={13} /> Rework
                  </button>
                  <button type="button" className="sup-btn-compact sup-btn-compact-primary" disabled={saving} onClick={() => void handleApproveLegacy(selectedRow.assignmentId!)}>
                    <Check size={13} /> Approve
                  </button>
                </>
              )}
              {(selectedRow.state === 'completed' || selectedRow.state === 'ready_for_qc') && selectedRow.assignmentId != null && (
                <button type="button" className="sup-btn-compact sup-btn-compact-secondary" onClick={() => setReviewPanel(selectedRow)}>
                  <CheckSquare size={13} /> Review
                </button>
              )}
              {canSubmitToDirector && (
                <button type="button" className="sup-btn-compact sup-btn-compact-primary" disabled={saving} onClick={() => void handleSubmitToDirector()}>
                  <SendHorizonal size={13} /> Submit to Director
                </button>
              )}
              {selectedProject?.project_state === 'submitted_to_director' && (
                <span className="rwa-submitted-badge">Submitted to Director</span>
              )}
              {!selectedRow.needsLegacyApproval
                && selectedRow.state !== 'completed'
                && selectedRow.state !== 'ready_for_qc'
                && !canSubmitToDirector
                && selectedProject?.project_state !== 'submitted_to_director' && (
                <span className="text-muted text-[11px]">No review action available for this panel yet.</span>
              )}
            </div>
            </div>
          </section>
          ) : (
          <section className="sup-review-card" aria-label="Director Submission">
            <div className="sup-review-head">
              <span className="flex items-center gap-2"><SendHorizonal size={15} className="sup-section-head-icon" aria-hidden /> Director Submission</span>
              <span className={`sup-review-state sup-review-state--${selectedRow.directorSubmitted ? 'done' : canSubmitSelectedPanel ? 'ok' : 'muted'}`}>
                {selectedRow.directorSubmitted ? 'Submitted to Director' : canSubmitSelectedPanel ? 'Ready to submit' : 'Not ready'}
              </span>
            </div>
            <div className="sup-review-body">
              <p className="text-[12px] text-muted m-0">
                {selectedRow.directorSubmitted
                  ? 'This panel is published to the Operations Director register.'
                  : canSubmitSelectedPanel
                    ? 'Confirm submission after verifying completion totals and OPEN END records.'
                    : 'Complete wiring and technician panel completion before submitting.'}
              </p>
              {selectedRow.directorSubmitted && selectedRow.directorSubmittedAt && (
                <p className="text-[12px] text-value m-0 mt-1">
                  Submitted {formatDateTime(selectedRow.directorSubmittedAt)}
                  {selectedRow.directorSubmittedBy ? ` · ${selectedRow.directorSubmittedBy}` : ''}
                </p>
              )}
              <div className="sup-review-actions mt-2">
                {canSubmitSelectedPanel && (
                  <button type="button" className="sup-btn-compact sup-btn-compact-primary" disabled={saving} onClick={() => void handleSubmitToDirector()}>
                    <SendHorizonal size={13} /> Submit to Director
                  </button>
                )}
                {selectedRow.directorSubmitted && (
                  <span className="rwa-submitted-badge">Submitted to Director</span>
                )}
              </div>
            </div>
          </section>
          )}
        </>
      )}

      {reportPanel && (
        <ReportPreviewModal
          assignmentId={reportPanel.assignmentId}
          projectCode={reportPanel.projectCode}
          frameId={reportPanel.frameId}
          panelName={reportPanel.panelName}
          onClose={() => setReportPanel(null)}
          showExport
        />
      )}

      {reviewPanel?.assignmentId && (
        <ReviewDecisionModal
          panel={reviewPanel}
          onClose={() => setReviewPanel(null)}
          onSaved={() => { setReviewPanel(null); void loadWorkspaceData({ silent: true }); }}
        />
      )}

      {reworkPanel && (
        <ReworkRequestModal
          panel={reworkPanel}
          onClose={() => setReworkPanel(null)}
          onSaved={() => { setReworkPanel(null); void loadWorkspaceData({ silent: true }); }}
        />
      )}

    </div>
  );
}

function ReviewDecisionModal({
  panel,
  onClose,
  onSaved,
}: {
  panel: PanelRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<ReviewStatus>(
    panel.reviewStatus === 'ready_for_qc' ? 'ready_for_qc' : panel.reviewStatus === 'rework' ? 'rework' : 'approved',
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const options: { value: ReviewStatus; label: string; hint: string }[] = [
    { value: 'approved', label: 'Approved', hint: 'Accepted as-is — ready for director submission' },
    { value: 'ready_for_qc', label: 'Send to QA/QC', hint: 'Route to QA/QC team for inspection' },
    { value: 'rework', label: 'Request Rework', hint: 'Return panel to technician' },
  ];

  const handleSave = async () => {
    if (!panel.assignmentId) return;
    setSaving(true);
    setError('');
    try {
      await supervisorApi.review(panel.assignmentId, status, notes);
      emitWorkflowChanged({ scope: 'approval', projectCode: panel.projectCode, frameId: panel.frameId });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Review failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Review — ${compactPanelDisplayName(panel.panelName)}`}
      icon={<CheckSquare />}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
            <Check size={16} />
            {saving ? 'Saving…' : 'Submit review'}
          </button>
        </>
      )}
    >
      <p className="text-[13px] text-muted mb-4">
        {panel.technician} <ArrowRight size={12} className="inline text-muted" /> {panel.projectCode}
      </p>
      <div className="flex flex-col gap-2 mb-4">
        {options.map(opt => (
          <label
            key={opt.value}
            className={`rwa-review-option ${status === opt.value ? 'is-selected' : ''}`}
          >
            <input type="radio" checked={status === opt.value} onChange={() => setStatus(opt.value)} className="accent-blue-600" />
            <div>
              <div className="font-semibold text-[13px]">{opt.label}</div>
              <div className="text-[11px] text-muted">{opt.hint}</div>
            </div>
          </label>
        ))}
      </div>
      <label className="form-label">Notes (optional)</label>
      <div className="field-with-icon field-with-icon--top">
        <span className="field-lead-icon"><FileText size={18} /></span>
        <textarea className="form-textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Review notes…" />
      </div>
      {error && <div className="form-error mt-2">{error}</div>}
    </Modal>
  );
}

function ReworkRequestModal({
  panel,
  onClose,
  onSaved,
}: {
  panel: PanelRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!panel.assignmentId || reason.trim().length < 5) {
      setError('Reason must be at least 5 characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await supervisorApi.rework(panel.assignmentId, reason);
      emitWorkflowChanged({ scope: 'approval', projectCode: panel.projectCode, frameId: panel.frameId });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Request failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Request Changes"
      icon={<Pencil />}
      iconTone="warning"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-danger" disabled={saving} onClick={() => void handleSave()}>
            <SendHorizonal size={16} />
            {saving ? 'Sending…' : 'Send request'}
          </button>
        </>
      )}
    >
      <p className="text-[13px] text-muted mb-3">
        {compactPanelDisplayName(panel.panelName)} <ArrowRight size={12} className="inline text-muted" /> {panel.technician}
      </p>
      <label className="form-label">Reason (min 5 characters)</label>
      <div className="field-with-icon field-with-icon--top">
        <span className="field-lead-icon"><MessageCircle size={18} /></span>
        <textarea className="form-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      {error && <div className="form-error mt-2">{error}</div>}
    </Modal>
  );
}
