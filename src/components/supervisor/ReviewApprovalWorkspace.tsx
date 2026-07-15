import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, RefreshCw, FileText, CheckSquare, Check, X,
  SendHorizonal, Building2, ArrowRight, ChevronRight, Pencil, MessageCircle,
} from '../ui/icons';
import Modal from '../Modal';
import ReportPreviewModal from '../ui/ReportPreviewModal';
import ProjectPdfPreviewModal from './ProjectPdfPreviewModal';
import { useAppDialog } from '../AppDialogProvider';
import { useDwesRefresh, type RefreshOptions } from '../../hooks/useDwesRefresh';
import { projectsApi, supervisorApi } from '../../services/api';
import type { Project } from '../../types';
import { compactPanelDisplayName, resolveProjectCardDetails } from '../../utils/projectDisplay';
import { onFramesChanged } from '../../utils/projectFramesEvents';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { useLatestRequest } from '../../hooks/useLatestRequest';

type PanelState = 'completed' | 'ready_for_qc' | 'in_progress' | 'paused' | 'assigned' | 'unassigned' | 'pending_approval';
type StatusBucket = 'completed' | 'in_progress' | 'pending_review' | 'not_started';
type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc';

const BUCKET_META: Record<StatusBucket, { label: string; short: string; chip: string }> = {
  completed: { label: 'Completed', short: 'Done', chip: 'bg-green-100 text-green-700 border-green-200' },
  in_progress: { label: 'In Progress', short: 'Active', chip: 'bg-amber-100 text-amber-800 border-amber-200' },
  pending_review: { label: 'Pending Review', short: 'Review', chip: 'bg-blue-100 text-blue-700 border-blue-200' },
  not_started: { label: 'Not Started', short: 'Waiting', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STATE_META: Record<PanelState, { label: string; pill: string }> = {
  completed: { label: 'Completed', pill: 'bg-green-100 text-green-700 border border-green-200' },
  in_progress: { label: 'In Progress', pill: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
  ready_for_qc: { label: 'QA/QC Review', pill: 'bg-violet-100 text-violet-800 border border-violet-200' },
  paused: { label: 'Paused', pill: 'bg-slate-100 text-slate-600 border border-slate-200' },
  assigned: { label: 'Assigned', pill: 'bg-blue-100 text-blue-700 border border-blue-200' },
  pending_approval: { label: 'Pending Approval', pill: 'bg-orange-100 text-orange-800 border border-orange-200' },
  unassigned: { label: 'Not Assigned', pill: 'bg-red-50 text-red-700 border border-red-200' },
};

const BUCKET_ORDER: StatusBucket[] = ['completed', 'in_progress', 'pending_review', 'not_started'];

interface PanelRow {
  key: string;
  frameId: string;
  projectCode: string;
  panelName: string;
  technician: string;
  assignmentId: number | null;
  state: PanelState;
  bucket: StatusBucket;
  progress: number;
  reviewStatus: string | null;
  reportSubmitted: boolean;
  needsLegacyApproval: boolean;
  cablesSrc: number;
  cablesDst: number;
  cablesTotal: number;
  technicianWhatsapp: string;
}

interface ProjectGroup {
  project: Project;
  projectCode: string;
  displayTitle: string;
  details: ReturnType<typeof resolveProjectCardDetails>;
  panels: PanelRow[];
  overallProgress: number;
  bucketCounts: Record<StatusBucket, number>;
  workflow: StatusBucket;
  canSubmitToDirector: boolean;
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

function toBucket(state: PanelState): StatusBucket {
  if (state === 'completed' || state === 'ready_for_qc') return state === 'ready_for_qc' ? 'pending_review' : 'completed';
  if (state === 'in_progress' || state === 'paused') return 'in_progress';
  if (state === 'pending_approval') return 'not_started';
  return 'not_started';
}

function projectWorkflow(panels: PanelRow[]): StatusBucket {
  if (panels.length === 0) return 'not_started';
  const counts = Object.fromEntries(BUCKET_ORDER.map(b => [b, 0])) as Record<StatusBucket, number>;
  for (const p of panels) counts[p.bucket] += 1;
  if (counts.in_progress > 0) return 'in_progress';
  if (counts.pending_review > 0) return 'pending_review';
  if (counts.completed === panels.length) return 'completed';
  return 'not_started';
}

function projectDisplayTitle(project: Project): string {
  const d = resolveProjectCardDetails(project);
  return d.client && d.client !== 'Not set'
    ? `${d.substationName} · ${d.client}`
    : d.substationName;
}

export default function ReviewApprovalWorkspace({ isActive = true }: { isActive?: boolean }) {
  const dialog = useAppDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [frames, setFrames] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeBucket, setActiveBucket] = useState<StatusBucket | null>(null);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const [reportPanel, setReportPanel] = useState<PanelRow | null>(null);
  const [reviewPanel, setReviewPanel] = useState<PanelRow | null>(null);
  const [reworkPanel, setReworkPanel] = useState<PanelRow | null>(null);
  const [projectPdf, setProjectPdf] = useState<{ code: string; title: string } | null>(null);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const requests = useLatestRequest();

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
      const validFrameKeys = new Set(frameLists.flat().map((frame: any) => `${frame.project_code}:${frame.id}`));
      const validProjectCodes = new Set(projs.map(project => project.code));
      setReportPanel(current => current && validFrameKeys.has(`${current.projectCode}:${current.frameId}`) ? current : null);
      setReviewPanel(current => current && validFrameKeys.has(`${current.projectCode}:${current.frameId}`) ? current : null);
      setReworkPanel(current => current && validFrameKeys.has(`${current.projectCode}:${current.frameId}`) ? current : null);
      setProjectPdf(current => current && validProjectCodes.has(current.code) ? current : null);
    } catch (error: any) {
      // A failed silent refresh keeps the last good workspace on screen.
      if (!silent && error?.code !== 'ERR_CANCELED' && requests.isLatest(request.id)) {
        setProjects([]);
        setFrames([]);
        setAssignments([]);
      }
    } finally {
      if (!silent && requests.isLatest(request.id)) setLoading(false);
    }
  }, [requests]);

  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (!isActive) {
      wasActiveRef.current = false;
      return;
    }
    wasActiveRef.current = true;
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
        setProjectPdf(current => current?.code === detail.projectCode ? null : current);
      } else if (detail.action === 'deleted' && detail.frameId) {
        setFrames(prev => prev.filter(f => !(f.project_code === detail.projectCode && f.id === detail.frameId)));
        setAssignments(prev => prev.filter(a => !(a.project_code === detail.projectCode && a.frame_id === detail.frameId)));
      }
      if (detail.action === 'deleted') {
        const deleted = (panel: PanelRow | null) => panel?.projectCode === detail.projectCode
          && (!detail.frameId || panel.frameId === detail.frameId);
        setReportPanel(current => deleted(current) ? null : current);
        setReviewPanel(current => deleted(current) ? null : current);
        setReworkPanel(current => deleted(current) ? null : current);
      }
    });
  }, [requests]);

  const assignmentByFrame = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of assignments) if (!m.has(a.frame_id)) m.set(a.frame_id, a);
    return m;
  }, [assignments]);

  const projectMap = useMemo(() => new Map(projects.map(p => [p.code, p])), [projects]);

  const rows: PanelRow[] = useMemo(() => frames.map(f => {
    const a = assignmentByFrame.get(f.id);
    const state = effectiveState(a);
    return {
      key: `${f.project_code}:${f.id}`,
      frameId: f.id,
      projectCode: f.project_code,
      panelName: a?.panel_display_name || f.panel_name || f.id,
      technician: a?.technician_name || a?.technician_username || '—',
      assignmentId: a?.id ?? null,
      state,
      bucket: toBucket(state),
      progress: a?.kpi ?? 0,
      reviewStatus: a?.review_status ?? null,
      reportSubmitted: Boolean(a?.report_submitted),
      needsLegacyApproval: Boolean(a?.status === 'assigned' && a?.supervisor_approved === false && !a?.rework_requested),
      cablesSrc: a?.cables_src_done ?? 0,
      cablesDst: a?.cables_dst_done ?? 0,
      cablesTotal: a?.cables_total ?? f.cable_count ?? 0,
      technicianWhatsapp: a?.technician_whatsapp || '',
    };
  }), [frames, assignmentByFrame]);

  const projectGroups: ProjectGroup[] = useMemo(() => {
    const byProject = new Map<string, PanelRow[]>();
    for (const r of rows) {
      const list = byProject.get(r.projectCode) ?? [];
      list.push(r);
      byProject.set(r.projectCode, list);
    }

    const q = search.trim().toLowerCase();
    const groups: ProjectGroup[] = [];

    for (const [code, panels] of byProject) {
      const project = projectMap.get(code);
      if (!project) continue;

      const bucketCounts = Object.fromEntries(BUCKET_ORDER.map(b => [b, 0])) as Record<StatusBucket, number>;
      for (const p of panels) bucketCounts[p.bucket] += 1;

      const filteredPanels = panels.filter(p => {
        if (activeBucket && p.bucket !== activeBucket) return false;
        if (!q) return true;
        const details = resolveProjectCardDetails(project);
        return (
          projectDisplayTitle(project).toLowerCase().includes(q)
          || details.projectCode.toLowerCase().includes(q)
          || p.panelName.toLowerCase().includes(q)
          || compactPanelDisplayName(p.panelName).toLowerCase().includes(q)
          || p.technician.toLowerCase().includes(q)
          || STATE_META[p.state].label.toLowerCase().includes(q)
        );
      });

      if (filteredPanels.length === 0 && (activeBucket || q)) continue;

      const overallProgress = panels.length
        ? Math.round(panels.reduce((s, p) => s + p.progress, 0) / panels.length)
        : 0;

      const completedWithAssignment = panels.filter(p => p.state === 'completed' || p.state === 'ready_for_qc');
      const canSubmitToDirector = completedWithAssignment.length > 0
        && completedWithAssignment.every(p => p.reviewStatus === 'approved')
        && project.project_state !== 'submitted_to_director';

      groups.push({
        project,
        projectCode: code,
        displayTitle: projectDisplayTitle(project),
        details: resolveProjectCardDetails(project),
        panels: filteredPanels,
        overallProgress,
        bucketCounts,
        workflow: projectWorkflow(panels),
        canSubmitToDirector,
      });
    }

    return groups.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
  }, [rows, search, activeBucket, projectMap]);

  const toggleProject = useCallback((code: string) => {
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedCodes(new Set(projectGroups.map(g => g.projectCode)));
  }, [projectGroups]);

  const collapseAll = useCallback(() => {
    setExpandedCodes(new Set());
  }, []);

  const didInitExpand = useRef(false);
  useEffect(() => {
    if (!didInitExpand.current && projectGroups.length > 0 && !loading) {
      setExpandedCodes(new Set([projectGroups[0].projectCode]));
      didInitExpand.current = true;
    }
  }, [projectGroups, loading]);

  const totalPanels = rows.length;
  const visiblePanels = projectGroups.reduce((n, g) => n + g.panels.length, 0);
  const pendingLegacyCount = rows.filter(r => r.needsLegacyApproval).length;

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

  const handleSubmitToDirector = async (code: string, title: string) => {
    const ok = await dialog.confirm({
      title: 'Submit to Director',
      message: `Submit "${title}" to the Operations Director? All completed panels must be approved.`,
      confirmText: 'Submit',
    });
    if (!ok) return;
    setSaving(true);
    setActionError('');
    try {
      await projectsApi.submitToDirector(code);
      emitWorkflowChanged({ scope: 'general', projectCode: code });
      await loadWorkspaceData({ silent: true });
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <p className="empty-text">Loading review workspace…</p>
      </div>
    );
  }

  return (
    <div className="rwa-workspace flex flex-col gap-4 min-w-0">
      <div className="rwa-toolbar">
        <div className="rwa-search">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project, panel, technician, or status…"
            className="form-input pl-9"
            aria-label="Search projects and panels"
          />
        </div>
        <button type="button" onClick={() => void loadWorkspaceData({ silent: true })} className="btn-secondary !h-11 !w-11 !px-0 shrink-0" title="Refresh">
          <RefreshCw size={16} />
        </button>
        <span className="rwa-stat">
          {visiblePanels} of {totalPanels} panels · {projectGroups.length} projects
        </span>
        {projectGroups.length > 1 && (
          <div className="rwa-expand-controls">
            <button type="button" className="rwa-expand-btn" onClick={expandAll}>Expand all</button>
            <button type="button" className="rwa-expand-btn" onClick={collapseAll}>Collapse all</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pendingLegacyCount > 0 && (
          <span className="rwa-legacy-chip">
            {pendingLegacyCount} legacy assignment{pendingLegacyCount !== 1 ? 's' : ''} awaiting approval
          </span>
        )}
        {BUCKET_ORDER.map(bucket => {
          const meta = BUCKET_META[bucket];
          const count = rows.filter(r => r.bucket === bucket).length;
          if (count === 0) return null;
          const isActive = activeBucket === bucket;
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => setActiveBucket(isActive ? null : bucket)}
              className={`rwa-bucket-chip ${isActive ? 'is-active' : ''} ${meta.chip}`}
            >
              {meta.short} <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
        {activeBucket && (
          <button type="button" onClick={() => setActiveBucket(null)} className="text-[11px] font-semibold text-blue-600 px-1">
            Clear filter
          </button>
        )}
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      {projectGroups.length === 0 ? (
        <div className="empty-state">
          <p className="empty-text">No projects match the current filters.</p>
        </div>
      ) : (
        <div className="rwa-project-stack">
          {projectGroups.map(group => (
            <ProjectWorkflowCard
              key={group.projectCode}
              group={group}
              expanded={expandedCodes.has(group.projectCode)}
              onToggle={() => toggleProject(group.projectCode)}
              saving={saving}
              onReport={setReportPanel}
              onReview={setReviewPanel}
              onRework={setReworkPanel}
              onApproveLegacy={handleApproveLegacy}
              onProjectReport={() => setProjectPdf({ code: group.projectCode, title: group.displayTitle })}
              onSubmitDirector={() => void handleSubmitToDirector(group.projectCode, group.displayTitle)}
            />
          ))}
        </div>
      )}

      {/* A panel with no assignment yet still has a report — it simply reads as
          Production Progress with nothing recorded, so it is not gated here. */}
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

      {projectPdf && (
        <ProjectPdfPreviewModal
          projectCode={projectPdf.code}
          title={`Project Report — ${projectPdf.title}`}
          onClose={() => setProjectPdf(null)}
        />
      )}
    </div>
  );
}

function ProjectWorkflowCard({
  group,
  expanded,
  onToggle,
  saving,
  onReport,
  onReview,
  onRework,
  onApproveLegacy,
  onProjectReport,
  onSubmitDirector,
}: {
  group: ProjectGroup;
  expanded: boolean;
  onToggle: () => void;
  saving: boolean;
  onReport: (p: PanelRow) => void;
  onReview: (p: PanelRow) => void;
  onRework: (p: PanelRow) => void;
  onApproveLegacy: (id: number) => void;
  onProjectReport: () => void;
  onSubmitDirector: () => void;
}) {
  const { displayTitle, details, panels, overallProgress, bucketCounts, workflow, project } = group;
  const stateLabel = (project.project_state || 'not_started').replace(/_/g, ' ');
  const panelCount = panels.length;

  return (
    <article className={`rwa-project-card rwa-project-card--${workflow} ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <button
        type="button"
        className="rwa-project-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <ChevronRight size={18} className={`rwa-chevron ${expanded ? 'is-open' : ''}`} />
        <Building2 size={16} className="rwa-project-icon shrink-0" />
        <div className="rwa-project-summary min-w-0">
          <h3 className="rwa-project-title" title={displayTitle}>{displayTitle}</h3>
          <p className="rwa-project-meta">
            {details.locationRegion} · {details.monthYear}
            <span className="rwa-project-code">{details.projectCode}</span>
          </p>
        </div>
        <div className="rwa-kpi-row">
          <span className="rwa-kpi-chip">{panelCount} panel{panelCount !== 1 ? 's' : ''}</span>
          <span className="rwa-kpi-chip rwa-kpi-chip--progress">{overallProgress}%</span>
          <span className="rwa-kpi-chip rwa-kpi-chip--state">{stateLabel}</span>
          {BUCKET_ORDER.map(bucket => {
            const count = bucketCounts[bucket];
            if (!count) return null;
            return (
              <span key={bucket} className={`rwa-kpi-chip ${BUCKET_META[bucket].chip}`}>
                {count} {BUCKET_META[bucket].short}
              </span>
            );
          })}
        </div>
      </button>

      {expanded && (
        <div className="rwa-project-body">
          {panelCount > 0 && (
            <div className="rwa-panel-scroll">
              <div className="rwa-panel-head" aria-hidden>
                <span>Panel</span>
                <span>Status</span>
                <span>Technician</span>
                <span>Progress</span>
                <span>Review / QC</span>
                <span>Actions</span>
              </div>
              {panels.map(panel => (
                <PanelWorkflowRow
                  key={panel.key}
                  panel={panel}
                  saving={saving}
                  onReport={() => onReport(panel)}
                  onReview={() => onReview(panel)}
                  onRework={() => onRework(panel)}
                  onApproveLegacy={() => panel.assignmentId && onApproveLegacy(panel.assignmentId)}
                />
              ))}
            </div>
          )}

          <div className="rwa-report-section">
            <div className="rwa-report-card">
              <div className="rwa-report-card-icon">
                <FileText size={20} />
              </div>
              <div className="rwa-report-card-copy min-w-0">
                <div className="rwa-report-card-title">Project Report</div>
                <div className="rwa-report-card-sub">
                  Read-only executive PDF for the full project — all panels and completion summary.
                </div>
              </div>
              <button type="button" className="rwa-report-btn" onClick={onProjectReport}>
                View Report
              </button>
            </div>

            <div className="rwa-report-actions">
              {group.canSubmitToDirector && (
                <button type="button" className="btn-primary !h-9 !text-[12px]" disabled={saving} onClick={onSubmitDirector}>
                  <SendHorizonal size={15} />
                  <span>Submit to Director</span>
                </button>
              )}
              {project.project_state === 'submitted_to_director' && (
                <span className="rwa-submitted-badge">Submitted to Director</span>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function PanelWorkflowRow({
  panel,
  saving,
  onReport,
  onReview,
  onRework,
  onApproveLegacy,
}: {
  panel: PanelRow;
  saving: boolean;
  onReport: () => void;
  onReview: () => void;
  onRework: () => void;
  onApproveLegacy: () => void;
}) {
  const meta = STATE_META[panel.state];
  const canReview = panel.state === 'completed' || panel.state === 'ready_for_qc';
  const showReport = panel.assignmentId != null && (panel.state === 'completed' || panel.state === 'ready_for_qc' || panel.reportSubmitted);
  const panelLabel = compactPanelDisplayName(panel.panelName);

  return (
    <div className="rwa-panel-row">
      <div className="rwa-panel-cell rwa-panel-cell--name">
        <span className="rwa-panel-name" title={panel.panelName}>{panelLabel}</span>
      </div>
      <div className="rwa-panel-cell">
        <span className={`rwa-panel-pill ${meta.pill}`}>{meta.label}</span>
      </div>
      <div className="rwa-panel-cell rwa-panel-cell--tech">
        <span className="rwa-panel-tech" title={panel.technician}>{panel.technician}</span>
      </div>
      <div className="rwa-panel-cell rwa-panel-cell--progress">
        <progress className="ops-assignment-progress rwa-panel-bar" value={panel.progress} max={100} />
        <span className="rwa-panel-pct">{panel.progress}%</span>
        <span className="rwa-cable-stat">
          {panel.cablesSrc}/{panel.cablesTotal}·{panel.cablesDst}/{panel.cablesTotal}
        </span>
      </div>
      <div className="rwa-panel-cell rwa-panel-cell--qc">
        {panel.reviewStatus ? (
          <span className="rwa-review-chip">{panel.reviewStatus.replace(/_/g, ' ')}</span>
        ) : (
          <span className="rwa-review-chip rwa-review-chip--muted">—</span>
        )}
        {panel.reportSubmitted && (
          <span className="rwa-review-chip rwa-review-chip--submitted">Submitted</span>
        )}
      </div>
      <div className="rwa-panel-cell rwa-panel-cell--actions">
        {panel.needsLegacyApproval && (
          <>
            <button type="button" className="rwa-action-btn rwa-action-btn--danger" disabled={saving} onClick={onRework} title="Request changes">
              <X size={13} />
            </button>
            <button type="button" className="rwa-action-btn rwa-action-btn--ok" disabled={saving} onClick={onApproveLegacy} title="Approve">
              <Check size={13} />
            </button>
          </>
        )}
        {showReport && (
          <button type="button" className="rwa-action-btn" onClick={onReport} title="Panel report">
            <FileText size={13} />
          </button>
        )}
        {canReview && panel.assignmentId && (
          <button type="button" className="rwa-action-btn rwa-action-btn--primary" onClick={onReview} title="Review">
            <CheckSquare size={13} />
          </button>
        )}
      </div>
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
      title={`Review — ${panel.panelName}`}
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
      <p className="text-[13px] text-slate-600 mb-4">
        {panel.technician} <ArrowRight size={12} className="inline text-slate-400" /> {panel.projectCode}
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
              <div className="text-[11px] text-slate-500">{opt.hint}</div>
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
      <p className="text-[13px] text-slate-600 mb-3">
        {panel.panelName} <ArrowRight size={12} className="inline text-slate-400" /> {panel.technician}
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
