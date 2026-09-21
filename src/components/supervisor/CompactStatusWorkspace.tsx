import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckSquare, Check, SendHorizonal, ArrowRight,
  MessageCircle, X, ChevronDown, ChevronRight, FileText,
} from '../ui/icons';
import { DashboardIcon } from '../ui/DashboardIcon';
import WorkspaceSectionHeading from '../ui/WorkspaceSectionHeading';
import Modal from '../Modal';
import ReportPreviewModal from '../ui/ReportPreviewModal';
import { useDwesRefresh, type RefreshOptions } from '../../hooks/useDwesRefresh';
import { projectsApi, supervisorApi } from '../../services/api';
import type { Project, PanelActivityData } from '../../types';
import { compactPanelDisplayName, projectSelectLabel, resolveProjectCardDetails } from '../../utils/projectDisplay';
import { emitWorkflowChanged, onWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import PanelTechnicianActivity from './PanelTechnicianActivity';
import SupervisorCrimpingDataView from './SupervisorCrimpingDataView';
import { useProjectSelectionStore } from '../../store/useProjectSelectionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { DwesLoadingCenter } from '../ui/DwesLoadingIndicator';
import { resolveSelectedPanelId } from '../../utils/panelSelection';
import { QA_QC_WORKFLOW_ENABLED } from '../../config/features';
import {
  isPanelEligibleForDirectorSubmit,
  isPanelSubmittedToDirector,
} from '../../utils/directorSubmissionEligibility';
import { useAppDialog } from '../AppDialogProvider';

type StatusView = 'all' | 'selected';
type PanelState =
  | 'completed'
  | 'ready_for_qc'
  | 'in_progress'
  | 'paused'
  | 'assigned'
  | 'unassigned'
  | 'pending_approval'
  | 'mid_changed';
type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc';
type ProjectRowStatus = 'completed' | 'in_progress' | 'not_started' | 'submitted';

const STATE_META: Record<PanelState, { label: string; pill: string }> = {
  completed: { label: 'Completed', pill: 'dwes-status-chip dwes-status-chip--completed' },
  in_progress: { label: 'In Progress', pill: 'dwes-status-chip dwes-status-chip--active' },
  ready_for_qc: { label: 'QA/QC Review', pill: 'dwes-status-chip dwes-status-chip--attention' },
  paused: { label: 'Paused', pill: 'dwes-status-chip dwes-status-chip--paused' },
  assigned: { label: 'Assigned', pill: 'dwes-status-chip dwes-status-chip--assigned' },
  pending_approval: { label: 'Pending Approval', pill: 'dwes-status-chip dwes-status-chip--attention' },
  unassigned: { label: 'Not Assigned', pill: 'dwes-status-chip dwes-status-chip--planned' },
  mid_changed: { label: 'Mid Changed', pill: 'dwes-status-chip dwes-status-chip--attention' },
};

const PROJECT_STATUS_META: Record<ProjectRowStatus, { label: string; pill: string }> = {
  completed: { label: 'Completed', pill: 'dwes-status-chip dwes-status-chip--completed' },
  in_progress: { label: 'In Progress', pill: 'dwes-status-chip dwes-status-chip--active' },
  not_started: { label: 'Not Started', pill: 'dwes-status-chip dwes-status-chip--planned' },
  submitted: { label: 'Submitted', pill: 'dwes-status-chip dwes-status-chip--assigned' },
};

/** Prefer the live assignment row (same rule as supervisor panelActivity). */
function pickCanonicalAssignment(candidates: any[]): any | undefined {
  if (!candidates.length) return undefined;
  const live = [...candidates]
    .filter(a => !a?.is_hidden && !a?.changeover_locked)
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  if (live.length) return live[0];
  return [...candidates].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
}

function effectiveState(a: any | undefined): PanelState {
  if (!a) return 'unassigned';
  const status = String(a.status || '');
  if (status === 'mid_changed' || a.changeover_locked) return 'mid_changed';
  if (status === 'assigned' && a.supervisor_approved === false && !a.rework_requested) {
    return 'pending_approval';
  }
  if (status === 'completed') {
    if (a.review_status === 'ready_for_qc') return 'ready_for_qc';
    return 'completed';
  }
  if (status === 'paused') return 'paused';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'assigned') return 'assigned';
  return 'assigned';
}

const REPORT_UNAVAILABLE_TOOLTIP = 'Upload a wiring schedule or assign a technician first';

function panelReportAvailable(assignment: any | undefined, panel: { cable_count?: number } | undefined): boolean {
  return assignment != null || (panel?.cable_count ?? 0) > 0;
}

function projectDisplayTitle(project: Project): string {
  const d = resolveProjectCardDetails(project);
  return d.client && d.client !== 'Not set'
    ? `${d.substationName} · ${d.client}`
    : d.substationName;
}

function ViewReportButton({
  disabled,
  tooltip,
  onClick,
}: {
  disabled: boolean;
  tooltip?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="sws-view-report-btn"
      disabled={disabled}
      title={disabled ? (tooltip ?? REPORT_UNAVAILABLE_TOOLTIP) : (tooltip ?? 'View Report')}
      aria-label={disabled ? (tooltip ?? REPORT_UNAVAILABLE_TOOLTIP) : 'View Report'}
      onClick={onClick}
    >
      <FileText size={15} aria-hidden />
      <span className="sws-action-btn__label">View Report</span>
    </button>
  );
}

interface PanelSummary {
  key: string;
  frameId: string;
  projectCode: string;
  panelName: string;
  cableCount: number;
  technician: string;
  assignment: any | undefined;
  state: PanelState;
  progress: number;
}

interface ProjectSummary {
  project: Project;
  panels: PanelSummary[];
  panelCount: number;
  progress: number;
  status: ProjectRowStatus;
  inProgressCount: number;
  completedCount: number;
}

export default function CompactStatusWorkspace({ isActive = true }: { isActive?: boolean }) {
  const dialog = useAppDialog();
  const { user } = useAuthStore();
  const sessionCode = useProjectSelectionStore(s => s.selectedProject?.code ?? null);
  const setSessionProject = useProjectSelectionStore(s => s.setProjectForUser);
  const setSelectedPanelForProject = useProjectSelectionStore(s => s.setSelectedPanelForProject);
  const selectedPanelByProject = useProjectSelectionStore(s => s.selectedPanelByProject);

  const [view, setView] = useState<StatusView>('all');
  const [projects, setProjects] = useState<Project[]>([]);
  const [frames, setFrames] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedProjectCode, setSelectedProjectCode] = useState('');
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);

  const [panelActivity, setPanelActivity] = useState<PanelActivityData | null>(null);
  const [panelActivityLoading, setPanelActivityLoading] = useState(false);
  const [panelActivityError, setPanelActivityError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const [reportPanel, setReportPanel] = useState<any | null>(null);
  const [crimpingDataPanel, setCrimpingDataPanel] = useState<{
    assignmentId: number;
    projectCode: string;
    panelName: string;
    technicianName?: string;
  } | null>(null);
  const [prepPortfolio, setPrepPortfolio] = useState<{
    cut: number;
    stripped: number;
    crimped: number;
    readyForWiring: number;
    totalWires: number;
  } | null>(null);
  const [reviewPanel, setReviewPanel] = useState<any | null>(null);
  const [reworkPanel, setReworkPanel] = useState<any | null>(null);
  const [workflowError, setWorkflowError] = useState('');

  const requests = useLatestRequest();
  const activityRequests = useLatestRequest();

  const loadWorkspaceData = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = requests.begin();
    if (!silent) setLoading(true);
    try {
      const projs = await projectsApi.list(request.signal) as Project[];
      const [frameLists, panelAssignments, portfolioResp] = await Promise.all([
        Promise.all(
          projs.map((p: Project) =>
            projectsApi.frames(p.code, request.signal)
              .then(fs => fs.map((f: any) => ({ ...f, project_code: p.code }))),
          ),
        ),
        supervisorApi.allPanels(request.signal),
        supervisorApi.crimpingPortfolio(undefined, request.signal).catch(() => null),
      ]);
      if (!requests.isLatest(request.id)) return;
      setProjects(projs);
      setFrames(frameLists.flat());
      setAssignments(panelAssignments);
      if (portfolioResp?.invented === false && portfolioResp?.portfolio) {
        const p = portfolioResp.portfolio;
        setPrepPortfolio({
          cut: Number(p.cut) || 0,
          stripped: Number(p.stripped) || 0,
          crimped: Number(p.crimped) || 0,
          readyForWiring: Number(p.readyForWiring) || 0,
          totalWires: Number(p.totalWires) || 0,
        });
      } else {
        setPrepPortfolio(null);
      }
      setLastRefreshed(new Date());
    } catch (e: any) {
      if (!silent && e?.code !== 'ERR_CANCELED' && requests.isLatest(request.id)) {
        setProjects([]);
        setFrames([]);
        setAssignments([]);
        setPrepPortfolio(null);
      }
    } finally {
      if (!silent && requests.isLatest(request.id)) setLoading(false);
    }
  }, [requests]);

  const reloadPanelActivity = useCallback((projectCode: string, frameId: string, options?: { silent?: boolean }) => {
    const request = activityRequests.begin();
    if (!options?.silent) setPanelActivityLoading(true);
    setPanelActivityError('');
    return supervisorApi.panelActivity(projectCode, frameId, request.signal)
      .then(data => {
        if (!activityRequests.isLatest(request.id)) return;
        setPanelActivity(data as PanelActivityData);
      })
      .catch((e: any) => {
        if (e?.code === 'ERR_CANCELED' || !activityRequests.isLatest(request.id)) return;
        setPanelActivity(null);
        setPanelActivityError('Technician activity could not be loaded.');
      })
      .finally(() => {
        if (!options?.silent && activityRequests.isLatest(request.id)) setPanelActivityLoading(false);
      });
  }, [activityRequests]);

  useEffect(() => {
    if (!isActive) return;
    void loadWorkspaceData();
  }, [isActive, loadWorkspaceData]);

  useDwesRefresh(options => {
    if (!isActive) return;
    void loadWorkspaceData(options);
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
      } else {
        void loadWorkspaceData({ silent: true });
      }
    });
  }, [requests, loadWorkspaceData]);

  const assignmentByFrame = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const a of assignments) {
      const key = `${a.project_code}::${a.frame_id}`;
      const list = grouped.get(key);
      if (list) list.push(a);
      else grouped.set(key, [a]);
    }
    const m = new Map<string, any>();
    for (const [key, list] of grouped) {
      const canonical = pickCanonicalAssignment(list);
      if (canonical) m.set(key, canonical);
    }
    return m;
  }, [assignments]);

  const projectSummaries: ProjectSummary[] = useMemo(() => {
    return projects.map(project => {
      const projectFrames = frames
        .filter(f => f.project_code === project.code)
        .sort((a, b) =>
          compactPanelDisplayName(a.panel_name).localeCompare(compactPanelDisplayName(b.panel_name)),
        );
      const panels: PanelSummary[] = projectFrames.map(f => {
        const assignment = assignmentByFrame.get(`${project.code}::${f.id}`);
        return {
          key: `${project.code}:${f.id}`,
          frameId: f.id,
          projectCode: project.code,
          panelName: assignment?.panel_display_name || f.panel_name || f.id,
          cableCount: f.cable_count ?? assignment?.cables_total ?? 0,
          technician: assignment?.technician_name || assignment?.technician_username || '—',
          assignment,
          state: effectiveState(assignment),
          progress: assignment?.kpi ?? 0,
        };
      });
      const panelCount = panels.length;
      let weightedDone = 0;
      let weightedTotal = 0;
      let completedCount = 0;
      let inProgressCount = 0;
      for (const panel of panels) {
        const weight = Math.max(panel.cableCount, panel.assignment?.cables_total ?? 0, 1);
        weightedDone += (panel.progress / 100) * weight;
        weightedTotal += weight;
        if (panel.state === 'completed' || panel.state === 'ready_for_qc') completedCount += 1;
        else if (panel.state !== 'unassigned') inProgressCount += 1;
      }
      const progress = weightedTotal > 0 ? Math.round((weightedDone / weightedTotal) * 100) : 0;
      let status: ProjectRowStatus = 'not_started';
      if (project.project_state === 'submitted_to_director') status = 'submitted';
      else if (panelCount > 0 && completedCount === panelCount) status = 'completed';
      else if (inProgressCount > 0 || completedCount > 0) status = 'in_progress';
      return { project, panels, panelCount, progress, status, inProgressCount, completedCount };
    });
  }, [projects, frames, assignmentByFrame]);

  const kpis = useMemo(() => {
    const totalProjects = projectSummaries.length;
    const totalPanels = projectSummaries.reduce((n, p) => n + p.panelCount, 0);
    const inProgress = projectSummaries.reduce((n, p) => n + p.inProgressCount, 0);
    const completed = projectSummaries.reduce((n, p) => n + p.completedCount, 0);
    let weightedDone = 0;
    let weightedTotal = 0;
    for (const summary of projectSummaries) {
      for (const panel of summary.panels) {
        const weight = Math.max(panel.cableCount, panel.assignment?.cables_total ?? 0, 1);
        weightedDone += (panel.progress / 100) * weight;
        weightedTotal += weight;
      }
    }
    const overallProgress = weightedTotal > 0 ? Math.round((weightedDone / weightedTotal) * 100) : 0;
    return { totalProjects, totalPanels, inProgress, completed, overallProgress };
  }, [projectSummaries]);

  /** Mutually exclusive panel-state buckets for the Status portfolio strip. */
  const stateBreakdown = useMemo(() => {
    const counts: Record<PanelState, number> = {
      unassigned: 0,
      assigned: 0,
      in_progress: 0,
      paused: 0,
      mid_changed: 0,
      pending_approval: 0,
      ready_for_qc: 0,
      completed: 0,
    };
    let wiringCompleted = 0;
    let wiringRemaining = 0;
    let reworkHold = 0;
    for (const summary of projectSummaries) {
      for (const panel of summary.panels) {
        counts[panel.state] += 1;
        const total = panel.assignment?.cables_total ?? panel.cableCount ?? 0;
        const done = panel.assignment?.cables_completed ?? 0;
        wiringCompleted += done;
        wiringRemaining += Math.max(0, total - done);
        if (panel.assignment?.rework_requested) reworkHold += 1;
      }
    }
    return { counts, wiringCompleted, wiringRemaining, reworkHold };
  }, [projectSummaries]);

  useEffect(() => {
    if (loading || projects.length === 0) return;
    setSelectedProjectCode(prev => {
      if (prev && projects.some(p => p.code === prev)) return prev;
      if (sessionCode && projects.some(p => p.code === sessionCode)) return sessionCode;
      return projects[0].code;
    });
  }, [loading, projects, sessionCode]);

  const selectedProject = projects.find(p => p.code === selectedProjectCode) ?? null;
  const selectedProjectSummary = projectSummaries.find(p => p.project.code === selectedProjectCode) ?? null;
  const projectPanels = selectedProjectSummary?.panels ?? [];

  useEffect(() => {
    setSelectedPanelId(prev => {
      if (prev && projectPanels.some(p => p.frameId === prev)) return prev;
      return resolveSelectedPanelId(
        selectedPanelByProject[selectedProjectCode],
        projectPanels.map(p => p.frameId),
      );
    });
  }, [projectPanels, selectedProjectCode, selectedPanelByProject]);

  useEffect(() => {
    if (view !== 'selected' || !selectedProjectCode || !selectedPanelId) {
      activityRequests.cancel();
      setPanelActivity(null);
      return;
    }
    const pc = selectedProjectCode;
    const fi = selectedPanelId;
    void reloadPanelActivity(pc, fi);

    const refreshTimer = window.setInterval(() => {
      void reloadPanelActivity(pc, fi, { silent: true });
    }, 12_000);

    const unsubscribe = onWorkflowChanged(detail => {
      if (detail.projectCode && detail.projectCode !== pc) return;
      if (detail.frameId && detail.frameId !== fi) return;
      void reloadPanelActivity(pc, fi, { silent: true });
      void loadWorkspaceData({ silent: true });
    });

    return () => {
      window.clearInterval(refreshTimer);
      unsubscribe();
      activityRequests.cancel();
    };
  }, [view, selectedPanelId, selectedProjectCode, reloadPanelActivity, loadWorkspaceData, activityRequests]);

  const rememberProject = (project: Project) => {
    if (user?.id) {
      setSessionProject({
        code: project.code,
        name: project.name,
        client: project.client,
        project_state: project.project_state,
        is_active: project.is_active,
      }, user.id);
    }
  };

  const handleProjectChange = (code: string) => {
    setSelectedProjectCode(code);
    const project = projects.find(p => p.code === code);
    if (project) rememberProject(project);
    const panels = projectSummaries.find(p => p.project.code === code)?.panels ?? [];
    setSelectedPanelId(resolveSelectedPanelId(selectedPanelByProject[code], panels.map(p => p.frameId)));
  };

  const handlePanelChange = (panelId: string) => {
    setSelectedPanelId(panelId);
    if (selectedProjectCode) setSelectedPanelForProject(selectedProjectCode, panelId);
  };

  const openSelectedPanel = (projectCode: string, panelId: string) => {
    const project = projects.find(p => p.code === projectCode);
    if (project) rememberProject(project);
    setSelectedProjectCode(projectCode);
    setSelectedPanelId(panelId);
    setSelectedPanelForProject(projectCode, panelId);
    setView('selected');
  };

  const toggleExpanded = (code: string) => {
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectedPanel = projectPanels.find(p => p.frameId === selectedPanelId);
  const assignment = selectedPanel?.assignment;
  const state = selectedPanel?.state ?? 'unassigned';
  const meta = STATE_META[state];
  const progress = selectedPanel?.progress ?? 0;
  const cablesSrc = assignment?.cables_src_done ?? 0;
  const cablesDst = assignment?.cables_dst_done ?? 0;
  const cablesTotal = assignment?.cables_total ?? selectedPanel?.cableCount ?? 0;
  const canViewPanelReport = panelReportAvailable(assignment, { cable_count: selectedPanel?.cableCount });
  const isCompletedPanel = state === 'completed' || state === 'ready_for_qc';
  const canReview = isCompletedPanel;
  const needsLegacyApproval = state === 'pending_approval';

  const canSubmitSelectedPanel = selectedProject != null
    && assignment != null
    && isPanelEligibleForDirectorSubmit(assignment)
    && !isPanelSubmittedToDirector(assignment);

  const completedAssignments = assignments.filter(
    a => a.project_code === selectedProjectCode && a.status === 'completed',
  );
  const canSubmitToDirector = QA_QC_WORKFLOW_ENABLED
    ? (selectedProject != null
      && completedAssignments.length > 0
      && !completedAssignments.some(a => a.review_status === 'ready_for_qc')
      && !completedAssignments.some(a => a.review_status === 'rework')
      && selectedProject.project_state !== 'submitted_to_director')
    : canSubmitSelectedPanel;

  const submitSelectedPanelToDirector = async () => {
    if (!selectedProject || !selectedPanel || !assignment) return;
    const ok = await dialog.confirm({
      title: 'Submit Report',
      message: 'Confirm submission of this completed panel report to the Operations Director.',
      confirmText: 'Submit Report',
      tone: 'save',
      actionSummary: 'Publishes this panel to the Director submitted-panel register.',
      entity: {
        label: 'Project · Panel',
        value: `${selectedProject.name} · ${compactPanelDisplayName(selectedPanel.panelName)}`,
        meta: selectedProject.code,
        kind: 'project',
      },
      counts: [
        { label: 'Technician', value: assignment.technician_name || '—' },
        { label: 'Total', value: assignment.cables_total ?? 0 },
        { label: 'Completed', value: assignment.cables_completed ?? 0 },
        { label: 'Open-end src/dst', value: `${assignment.open_end_source ?? 0} / ${assignment.open_end_destination ?? 0}` },
        { label: 'Completion time', value: assignment.completed_at ? new Date(assignment.completed_at).toLocaleString() : '—' },
      ],
    });
    if (!ok) return;
    try {
      await projectsApi.submitToDirector(selectedProject.code, {
        frameId: selectedPanel.frameId,
        assignmentId: assignment.id,
      });
      emitWorkflowChanged({ scope: 'general', projectCode: selectedProject.code, frameId: selectedPanel.frameId });
      void loadWorkspaceData({ silent: true });
    } catch (e: any) {
      setWorkflowError(e?.response?.data?.message || 'Submission failed');
    }
  };

  const timeString = lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="sws-root">
      <section className="sws-workspace-shell" aria-label="Status Workspace">
        <WorkspaceSectionHeading
          variant="primary"
          title="Status Workspace"
          icon={<DashboardIcon name="status" size={15} />}
          className="sws-workspace-heading"
          actions={(
            <>
              <div className="sws-view-toggle" role="tablist" aria-label="Status view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'all'}
                  className={`sws-view-btn${view === 'all' ? ' is-active' : ''}`}
                  onClick={() => setView('all')}
                >
                  <DashboardIcon name="projects" size={14} />
                  All Projects
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'selected'}
                  className={`sws-view-btn${view === 'selected' ? ' is-active' : ''}`}
                  onClick={() => setView('selected')}
                  disabled={!selectedProject || !selectedPanel}
                >
                  <DashboardIcon name="panels" size={14} />
                  Selected Panel
                </button>
              </div>
              <span className="sws-heading-updated hidden sm:inline">Updated {timeString}</span>
              <button
                type="button"
                className="workspace-section-heading-refresh"
                onClick={() => void loadWorkspaceData({ silent: true })}
                title="Refresh Status"
                aria-label="Refresh Status"
              >
                <DashboardIcon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
        />

        <div className="sws-workspace-body">
      {view === 'all' ? (
        <>
          <div className="sws-kpi-row" aria-label="Status overview KPIs">
            <div className="sws-kpi-item">
              <span className="sws-kpi-label">Total Projects</span>
              <span className="sws-kpi-value">{kpis.totalProjects}</span>
            </div>
            <div className="sws-kpi-item">
              <span className="sws-kpi-label">Total Panels</span>
              <span className="sws-kpi-value">{kpis.totalPanels}</span>
            </div>
            <div className="sws-kpi-item sws-kpi-item--active">
              <span className="sws-kpi-label">In Progress</span>
              <span className="sws-kpi-value">{kpis.inProgress}</span>
            </div>
            <div className="sws-kpi-item sws-kpi-item--completed">
              <span className="sws-kpi-label">Completed</span>
              <span className="sws-kpi-value">{kpis.completed}</span>
            </div>
            <div className="sws-kpi-item sws-kpi-item--progress">
              <span className="sws-kpi-label">Overall Progress</span>
              <span className="sws-kpi-value">{kpis.overallProgress}%</span>
              <progress className="sws-kpi-bar" value={kpis.overallProgress} max={100} aria-label="Overall progress" />
            </div>
          </div>

          <div className="sws-portfolio-strip" aria-label="Panel assignment and wiring portfolio">
            <div className="sws-portfolio-group" aria-label="Assignment states">
              <span className="sws-portfolio-heading">Assignment</span>
              <ul className="sws-portfolio-chips">
                {([
                  ['unassigned', 'Not Assigned'],
                  ['assigned', 'Assigned / Not Started'],
                  ['in_progress', 'In Progress'],
                  ['paused', 'Paused'],
                  ['mid_changed', 'Mid Changed'],
                  ['pending_approval', 'Pending Approval'],
                  ['ready_for_qc', 'QA Hold'],
                  ['completed', 'Completed'],
                ] as const).map(([key, label]) => (
                  <li key={key}>
                    <span className={STATE_META[key].pill}>
                      {label}
                      <strong className="tabular-nums">{stateBreakdown.counts[key]}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sws-portfolio-group" aria-label="Wiring totals">
              <span className="sws-portfolio-heading">Wiring</span>
              <ul className="sws-portfolio-chips">
                <li>
                  <span className="dwes-status-chip dwes-status-chip--completed">
                    Completed cables
                    <strong className="tabular-nums">{stateBreakdown.wiringCompleted}</strong>
                  </span>
                </li>
                <li>
                  <span className="dwes-status-chip dwes-status-chip--planned">
                    Remaining cables
                    <strong className="tabular-nums">{stateBreakdown.wiringRemaining}</strong>
                  </span>
                </li>
                <li>
                  <span className={`dwes-status-chip ${stateBreakdown.reworkHold > 0 ? 'dwes-status-chip--rework' : 'dwes-status-chip--planned'}`}>
                    Rework / QA Hold
                    <strong className="tabular-nums">{stateBreakdown.reworkHold}</strong>
                  </span>
                </li>
              </ul>
            </div>
            {prepPortfolio ? (
              <div className="sws-portfolio-group" aria-label="Preparation Cut Strip Crimp portfolio">
                <span className="sws-portfolio-heading">Preparation</span>
                <ul className="sws-portfolio-chips">
                  <li>
                    <span className="dwes-status-chip dwes-status-chip--assigned">
                      Cut
                      <strong className="tabular-nums">{prepPortfolio.cut}</strong>
                    </span>
                  </li>
                  <li>
                    <span className="dwes-status-chip dwes-status-chip--active">
                      Stripped
                      <strong className="tabular-nums">{prepPortfolio.stripped}</strong>
                    </span>
                  </li>
                  <li>
                    <span className="dwes-status-chip dwes-status-chip--completed">
                      Crimped
                      <strong className="tabular-nums">{prepPortfolio.crimped}</strong>
                    </span>
                  </li>
                  <li>
                    <span className="dwes-status-chip dwes-status-chip--planned">
                      Ready for Wiring
                      <strong className="tabular-nums">{prepPortfolio.readyForWiring}</strong>
                    </span>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>

          <div className="sws-project-table" aria-label="All projects status">
            {loading && projects.length === 0 ? (
              <DwesLoadingCenter label="Loading projects…" className="sws-empty" />
            ) : projectSummaries.length === 0 ? (
              <div className="sws-empty">No projects available.</div>
            ) : (
              <>
                <div className="sws-matrix-head sws-matrix-grid" aria-hidden="true">
                  <span className="sws-matrix-lead" />
                  <span>Project / Panel</span>
                  <span>Assigned Technician</span>
                  <span className="tabular-nums">Panels</span>
                  <span className="tabular-nums">Completed</span>
                  <span>Progress</span>
                  <span>Status</span>
                  <span className="sws-matrix-action-head">Action</span>
                </div>
                <ul className="sws-project-list">
                {projectSummaries.map(summary => {
                  const hasPanels = summary.panelCount > 0;
                  const expanded = hasPanels && expandedCodes.has(summary.project.code);
                  const statusMeta = PROJECT_STATUS_META[summary.status];
                  const isProjectSelected = selectedProjectCode === summary.project.code;
                  return (
                    <li key={summary.project.code} className={`sws-project-block${expanded ? ' is-expanded' : ''}`}>
                      <div className="sws-project-row sws-matrix-grid">
                        {hasPanels ? (
                          <button
                            type="button"
                            className="sws-project-expand sws-cell-lead"
                            aria-expanded={expanded}
                            aria-label={expanded ? 'Collapse panels' : 'Expand panels'}
                            onClick={() => toggleExpanded(summary.project.code)}
                          >
                            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        ) : (
                          <span className="sws-matrix-lead sws-cell-lead" aria-hidden />
                        )}
                        <button
                          type="button"
                          className="sws-project-name sws-cell-name"
                          onClick={() => { if (hasPanels) toggleExpanded(summary.project.code); }}
                          disabled={!hasPanels}
                          title={projectDisplayTitle(summary.project)}
                        >
                          {projectDisplayTitle(summary.project)}
                        </button>
                        <span className="sws-matrix-muted sws-cell-tech" data-label="Assigned" aria-hidden="true">—</span>
                        <span className="sws-matrix-count tabular-nums sws-cell-total" data-label="Panels">
                          {summary.panelCount}
                        </span>
                        <span className="sws-matrix-count tabular-nums sws-cell-done" data-label="Completed">
                          {summary.completedCount}
                          {summary.inProgressCount > 0 ? (
                            <span className="sws-matrix-muted text-[11px] font-medium"> / {summary.inProgressCount} active</span>
                          ) : null}
                        </span>
                        <div className="sws-progress-cell sws-cell-progress" data-label="Progress">
                          <span className="sws-project-pct tabular-nums">{summary.progress}%</span>
                          <progress className="sws-slim-bar" value={summary.progress} max={100} aria-label={`${projectDisplayTitle(summary.project)} progress`} />
                        </div>
                        <span className={`sws-status-pill sws-cell-status ${statusMeta.pill}`} data-label="Status">{statusMeta.label}</span>
                        <div className="sws-matrix-action sws-cell-action">
                          <button
                            type="button"
                            className={`sws-select-btn${isProjectSelected ? ' is-selected' : ''}`}
                            aria-pressed={isProjectSelected}
                            aria-label={isProjectSelected ? 'Selected' : `Select ${projectDisplayTitle(summary.project)}`}
                            onClick={() => {
                              const firstPanel = summary.panels[0];
                              if (!firstPanel) {
                                rememberProject(summary.project);
                                setSelectedProjectCode(summary.project.code);
                                setView('selected');
                                return;
                              }
                              openSelectedPanel(summary.project.code, firstPanel.frameId);
                            }}
                          >
                            {isProjectSelected
                              ? <Check size={15} aria-hidden />
                              : <CheckSquare size={15} aria-hidden />}
                            <span className="sws-action-btn__label">
                              {isProjectSelected ? 'Selected' : 'Select'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <ul className="sws-panel-list">
                          {summary.panels.map(panel => {
                              const panelMeta = STATE_META[panel.state];
                              const canReport = panelReportAvailable(panel.assignment, { cable_count: panel.cableCount });
                              return (
                                <li key={panel.key} className="sws-panel-row sws-matrix-grid">
                                  <span className="sws-matrix-lead sws-cell-lead" aria-hidden />
                                  <button
                                    type="button"
                                    className="sws-panel-name sws-cell-name"
                                    onClick={() => openSelectedPanel(panel.projectCode, panel.frameId)}
                                    title={panel.panelName}
                                  >
                                    {compactPanelDisplayName(panel.panelName)}
                                  </button>
                                  <span className="sws-panel-tech sws-cell-tech" data-label="Technician" title={panel.technician}>{panel.technician}</span>
                                  <span className="sws-matrix-count tabular-nums sws-cell-total" data-label="Total wires">
                                    {panel.assignment?.cables_total ?? panel.cableCount ?? 0}
                                  </span>
                                  <span className="sws-matrix-count tabular-nums sws-cell-done" data-label="Completed">
                                    {panel.assignment?.cables_completed ?? 0}
                                  </span>
                                  <div className="sws-progress-cell sws-cell-progress" data-label="Progress">
                                    <span className="sws-project-pct tabular-nums">{panel.progress}%</span>
                                    <progress className="sws-slim-bar" value={panel.progress} max={100} aria-label={`${panel.panelName} progress`} />
                                  </div>
                                  <span className={`sws-status-pill sws-cell-status ${panelMeta.pill}`} data-label="Status">{panelMeta.label}</span>
                                  <div className="sws-matrix-action sws-cell-action">
                                    <ViewReportButton
                                      disabled={!canReport}
                                      onClick={() => setReportPanel({
                                        assignmentId: panel.assignment?.id,
                                        projectCode: panel.projectCode,
                                        frameId: panel.frameId,
                                        panelName: panel.panelName,
                                      })}
                                    />
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="pj-project-select-row">
            <div className="pj-project-select-field">
              <label htmlFor="cw-active-project" className="text-[12px] font-medium uppercase tracking-wide text-label">
                Active project
              </label>
              <select
                id="cw-active-project"
                className="pj-project-select"
                value={selectedProject?.code ?? ''}
                onChange={e => handleProjectChange(e.target.value)}
                disabled={loading}
              >
                <option value="">{loading ? 'Loading projects...' : projects.length === 0 ? 'No Project Available' : 'Select a project...'}</option>
                {projects.map(p => (
                  <option key={p.code} value={p.code}>{projectSelectLabel(p)}</option>
                ))}
              </select>
            </div>
            <div className="pj-project-select-field">
              <label htmlFor="cw-active-panel" className="text-[12px] font-medium uppercase tracking-wide text-label">
                Active panel
              </label>
              <select
                id="cw-active-panel"
                className="pj-panel-select"
                value={selectedPanelId}
                onChange={e => handlePanelChange(e.target.value)}
                disabled={!selectedProject || projectPanels.length === 0}
              >
                <option value="">
                  {projectPanels.length === 0 ? 'No Panels Available' : 'Select a panel...'}
                </option>
                {projectPanels.map(p => (
                  <option key={p.frameId} value={p.frameId}>{compactPanelDisplayName(p.panelName)}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedProject && selectedPanel ? (
            <div className="sws-selected-panel" aria-label="Selected panel status">
              {/* Identity stays in Active project/panel selectors — overview is work-state only */}
              <div className="sws-panel-overview">
                <div className="min-w-0 flex flex-wrap items-center gap-2">
                  <span className={`sws-status-pill ${meta.pill}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="sws-selected-progress-block">
                  <div className="sws-selected-progress-head">
                    <span className="sws-selected-progress-label">Progress</span>
                    <span className="sws-selected-progress-value tabular-nums">{progress}%</span>
                  </div>
                  <progress className="sws-kpi-bar sws-selected-progress-bar" value={progress} max={100} />
                  <div className="sws-selected-cable-meta">
                    {cablesSrc}/{cablesTotal} SRC · {cablesDst}/{cablesTotal} DST
                  </div>
                </div>
              </div>

              <div className="sws-section-grid">
                <div className="min-w-0 sws-compact-section sws-compact-section--flat">
                  <WorkspaceSectionHeading
                    variant="secondary"
                    title="Technician Activity"
                    icon={<DashboardIcon name="assignment" size={15} />}
                    className="mb-1.5"
                  />
                  <PanelTechnicianActivity
                    activity={panelActivity}
                    loading={panelActivityLoading}
                    error={panelActivityError}
                    compact
                  />
                </div>

                <div className="flex flex-col gap-2 min-w-0 sws-compact-section sws-compact-section--flat">
                  <WorkspaceSectionHeading
                    variant="secondary"
                    title="Reports & Review"
                    icon={<DashboardIcon name="review_queue" size={15} />}
                  />

                  <div className="sws-report-list">
                    <div className="sws-report-row sws-report-row--flat">
                      <div className="sws-report-row-main">
                        <div className="sws-report-row-icon" aria-hidden>
                          <DashboardIcon name="history" size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="sws-report-row-title">Panel Report</div>
                          <div className="sws-report-row-desc">
                            {isCompletedPanel
                              ? `Finalized read-only record for ${compactPanelDisplayName(selectedPanel.panelName)}`
                              : `Read-only live report for ${compactPanelDisplayName(selectedPanel.panelName)}`}
                          </div>
                        </div>
                      </div>
                      <ViewReportButton
                        disabled={!canViewPanelReport}
                        onClick={() => setReportPanel({
                          assignmentId: assignment?.id,
                          projectCode: selectedProject.code,
                          frameId: selectedPanel.frameId,
                          panelName: selectedPanel.panelName,
                        })}
                      />
                    </div>

                    <div className="sws-report-row sws-report-row--flat">
                      <div className="sws-report-row-main">
                        <div className="sws-report-row-icon" aria-hidden>
                          <DashboardIcon name="review_queue" size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="sws-report-row-title">Crimping Data</div>
                          <div className="sws-report-row-desc">
                            Panel stripping / crimping table, filters, and Crimping Required controls.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="sws-view-report-btn"
                        disabled={!assignment?.id}
                        title={assignment?.id ? 'Open Crimping Data' : 'Assign a technician first'}
                        onClick={() => {
                          if (!assignment?.id) return;
                          setCrimpingDataPanel({
                            assignmentId: Number(assignment.id),
                            projectCode: selectedProject.code,
                            panelName: selectedPanel.panelName,
                            technicianName: assignment.technician_name,
                          });
                        }}
                      >
                        <FileText size={15} aria-hidden />
                        <span className="sws-action-btn__label">Open</span>
                      </button>
                    </div>

                    <div className="sws-report-row sws-report-row--flat">
                      <div className="sws-report-row-main">
                        <div className="sws-report-row-icon" aria-hidden>
                          <DashboardIcon name="launch" size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="sws-report-row-title">Submit Report</div>
                          <div className="sws-report-row-desc">
                            {isPanelSubmittedToDirector(assignment)
                              ? 'Published to the Operations Director submitted-panel register.'
                              : canSubmitToDirector
                                ? 'Send this completed panel report to the Operations Director.'
                                : 'Complete wiring on this panel before submitting to the Director.'}
                          </div>
                        </div>
                      </div>
                      {isPanelSubmittedToDirector(assignment) ? (
                        <span className="rwa-submitted-badge shrink-0">Submitted</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary sws-touch-btn !text-[12px] shrink-0"
                          disabled={!canSubmitToDirector}
                          onClick={() => void submitSelectedPanelToDirector()}
                        >
                          <SendHorizonal size={14} aria-hidden /> Submit Report
                        </button>
                      )}
                    </div>
                  </div>

                  {(QA_QC_WORKFLOW_ENABLED && (canReview || needsLegacyApproval)) && (
                    <div className="sws-review-actions">
                      <div className="sws-review-actions-title">
                        {needsLegacyApproval ? 'Supervisor Approval Required' : 'QA/QC Review Required'}
                      </div>
                      <div className="flex gap-2">
                        {needsLegacyApproval ? (
                          <button
                            type="button"
                            className="btn-primary sws-touch-btn flex-1"
                            onClick={async () => {
                              try {
                                await supervisorApi.approve(Number(assignment.id));
                                emitWorkflowChanged({
                                  scope: 'approval',
                                  projectCode: selectedProject.code,
                                  frameId: selectedPanel.frameId,
                                });
                                void loadWorkspaceData({ silent: true });
                              } catch (e: any) {
                                setWorkflowError(e?.response?.data?.message || 'Approval failed');
                              }
                            }}
                          >
                            <Check size={14} /> Approve Work
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn-primary sws-touch-btn flex-1"
                              onClick={() => setReviewPanel({
                                assignmentId: assignment.id,
                                projectCode: selectedProject.code,
                                frameId: selectedPanel.frameId,
                                panelName: selectedPanel.panelName,
                                technician: assignment.technician_name,
                              })}
                            >
                              <Check size={14} /> Review & Approve
                            </button>
                            <button
                              type="button"
                              className="btn-secondary sws-touch-btn flex-1 border-slate-300 hover:bg-slate-200"
                              onClick={() => setReworkPanel({
                                assignmentId: assignment.id,
                                projectCode: selectedProject.code,
                                frameId: selectedPanel.frameId,
                                panelName: selectedPanel.panelName,
                                technician: assignment.technician_name,
                              })}
                            >
                              <X size={14} /> Request Rework
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {workflowError && <p className="form-error">{workflowError}</p>}

                  {assignment && QA_QC_WORKFLOW_ENABLED && (
                    <div className="flex flex-col gap-1 p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-baseline justify-between gap-3 text-[12px]">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Reviewer</span>
                        <span className="text-value text-right truncate">
                          {assignment.reviewer_name || '—'}
                          {assignment.reviewed_at && (
                            <span className="text-muted text-[11px]"> · {new Date(assignment.reviewed_at).toLocaleString()}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-[12px]">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Approver</span>
                        <span className="text-value text-right truncate">
                          {assignment.approver_name || '—'}
                          {assignment.approved_at && (
                            <span className="text-muted text-[11px]"> · {new Date(assignment.approved_at).toLocaleString()}</span>
                          )}
                        </span>
                      </div>
                      <details className="mt-0.5">
                        <summary className="cursor-pointer select-none text-[11px] font-bold text-label list-none">▸ Audit history</summary>
                        <ul className="flex flex-col gap-1 mt-1.5 m-0 p-0 list-none text-[11.5px]">
                          <li className="flex justify-between gap-3">
                            <span className="text-muted">Assigned</span>
                            <span className="text-value">{assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleString() : '—'}</span>
                          </li>
                          {assignment.started_at && (
                            <li className="flex justify-between gap-3">
                              <span className="text-muted">Started</span>
                              <span className="text-value">{new Date(assignment.started_at).toLocaleString()}</span>
                            </li>
                          )}
                          {assignment.completed_at && (
                            <li className="flex justify-between gap-3">
                              <span className="text-muted">Completed</span>
                              <span className="text-value">{new Date(assignment.completed_at).toLocaleString()}</span>
                            </li>
                          )}
                          {assignment.rework_requested_at && (
                            <li className="flex flex-col">
                              <span className="flex justify-between gap-3">
                                <span className="text-muted">Rework requested{assignment.rework_by_name ? ` by ${assignment.rework_by_name}` : ''}</span>
                                <span className="text-value">{new Date(assignment.rework_requested_at).toLocaleString()}</span>
                              </span>
                              {assignment.rework_reason && <span className="text-muted text-[11px] italic">“{assignment.rework_reason}”</span>}
                            </li>
                          )}
                          {assignment.reviewed_at && (
                            <li className="flex flex-col">
                              <span className="flex justify-between gap-3">
                                <span className="text-muted">Reviewed{assignment.reviewer_name ? ` by ${assignment.reviewer_name}` : ''}</span>
                                <span className="text-value">{new Date(assignment.reviewed_at).toLocaleString()} — {(assignment.review_status || '').replace(/_/g, ' ')}</span>
                              </span>
                              {assignment.review_notes && <span className="text-muted text-[11px] italic">“{assignment.review_notes}”</span>}
                            </li>
                          )}
                          {assignment.approved_at && (
                            <li className="flex justify-between gap-3">
                              <span className="text-muted">Approved{assignment.approver_name ? ` by ${assignment.approver_name}` : ''}</span>
                              <span className="text-value">{new Date(assignment.approved_at).toLocaleString()}</span>
                            </li>
                          )}
                          {selectedProject.project_state === 'submitted_to_director' && (
                            <li className="flex justify-between gap-3">
                              <span className="text-muted">Submitted to Director</span>
                              <span className="text-value">✓</span>
                            </li>
                          )}
                        </ul>
                      </details>
                    </div>
                  )}

                </div>
              </div>
            </div>
          ) : (
            <div className="sws-empty">Select a project and panel to view details.</div>
          )}
        </>
      )}
        </div>
      </section>

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
      {crimpingDataPanel && (
        <SupervisorCrimpingDataView
          assignmentId={crimpingDataPanel.assignmentId}
          projectCode={crimpingDataPanel.projectCode}
          panelName={crimpingDataPanel.panelName}
          technicianName={crimpingDataPanel.technicianName}
          onClose={() => setCrimpingDataPanel(null)}
        />
      )}
      {reviewPanel && (
        <ReviewModal
          panel={reviewPanel}
          onClose={() => setReviewPanel(null)}
          onSaved={() => { setReviewPanel(null); void loadWorkspaceData({ silent: true }); }}
        />
      )}
      {reworkPanel && (
        <ReworkModal
          panel={reworkPanel}
          onClose={() => setReworkPanel(null)}
          onSaved={() => { setReworkPanel(null); void loadWorkspaceData({ silent: true }); }}
        />
      )}
    </div>
  );
}

function ReviewModal({ panel, onClose, onSaved }: any) {
  const [status, setStatus] = useState<ReviewStatus>('approved');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const options: { value: ReviewStatus; label: string; hint: string }[] = [
    { value: 'approved', label: 'Approve & Finalize', hint: 'Mark panel as complete' },
    { value: 'rework', label: 'Request Rework', hint: 'Return panel to technician' },
  ];

  const handleSave = async () => {
    if (!panel.assignmentId) return;
    setSaving(true);
    setError('');
    try {
      await supervisorApi.review(Number(panel.assignmentId), status, notes);
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
      title={`Review - ${panel.panelName}`}
      icon={<CheckSquare />}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
            <Check size={16} />
            {saving ? 'Saving...' : 'Submit review'}
          </button>
        </>
      )}
    >
      <p className="text-[13px] text-muted mb-4">
        {panel.technician} <ArrowRight size={12} className="inline text-slate-400" /> {panel.projectCode}
      </p>
      <div className="flex flex-col gap-2 mb-4">
        {options.map(opt => (
          <label
            key={opt.value}
            className={`flex flex-col p-3 rounded-lg border-2 cursor-pointer transition-colors ${
              status === opt.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="review_status"
                value={opt.value}
                checked={status === opt.value}
                onChange={e => setStatus(e.target.value as ReviewStatus)}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span className="text-[14px] font-bold text-primary">{opt.label}</span>
            </div>
            <span className="text-[12px] text-muted ml-6">{opt.hint}</span>
          </label>
        ))}
      </div>
      <label className="form-label">Review Notes (Optional)</label>
      <div className="field-with-icon field-with-icon--top">
        <MessageCircle size={18} className="icon" />
        <textarea
          className="form-input form-textarea"
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={status === 'rework' ? 'Please provide rework instructions...' : 'Any final notes...'}
          required={status === 'rework'}
        />
      </div>
      {error && <p className="form-error mt-2">{error}</p>}
    </Modal>
  );
}

function ReworkModal({ panel, onClose, onSaved }: any) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!panel.assignmentId || reason.trim().length < 5) {
      setError('A reason of at least 5 characters is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await supervisorApi.rework(Number(panel.assignmentId), reason);
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
      iconTone="warning"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-danger" disabled={saving} onClick={handleSave}>
            <SendHorizonal size={16} />
            {saving ? 'Sending...' : 'Send request'}
          </button>
        </>
      )}
    >
      <p className="text-[13px] text-muted mb-3">
        {panel.panelName} <ArrowRight size={12} className="inline text-slate-400" /> {panel.technician}
      </p>
      <label className="form-label">Reason (min 5 characters)</label>
      <div className="field-with-icon field-with-icon--top">
        <MessageCircle size={18} className="icon" />
        <textarea
          className="form-input form-textarea"
          rows={4}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain what needs to be fixed..."
          autoFocus
        />
      </div>
      {error && <p className="form-error mt-2">{error}</p>}
    </Modal>
  );
}
