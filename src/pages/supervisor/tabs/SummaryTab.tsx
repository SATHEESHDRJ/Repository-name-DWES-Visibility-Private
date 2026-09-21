import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw } from '../../../components/ui/icons';
import { projectsApi, supervisorApi } from '../../../services/api';
import type { Project } from '../../../types';
import { useDwesRefresh } from '../../../hooks/useDwesRefresh';
import { DwesLoadingState } from '../../../components/ui/DwesLoadingIndicator';
import OperationsCentreSection from '../../../components/supervisor/OperationsCentreSection';

/* Granular per-panel status (maps real columns → display state). */
type PanelState = 'completed' | 'ready_for_qc' | 'in_progress' | 'paused' | 'assigned' | 'unassigned';

/** High-level buckets for summary chips. */
type StatusBucket = 'completed' | 'in_progress' | 'pending_review' | 'not_started';

const BUCKET_META: Record<StatusBucket, {
  label: string;
  short: string;
  chip: string;
}> = {
  completed:      { label: 'Completed',      short: 'Done',    chip: 'bg-green-100 text-green-700 border-green-200' },
  in_progress:    { label: 'In Progress',    short: 'Active',  chip: 'bg-amber-100 text-amber-800 border-amber-200' },
  pending_review: { label: 'Pending Review', short: 'Review',  chip: 'bg-blue-100 text-blue-700 border-blue-200' },
  not_started:    { label: 'Not Started',    short: 'Waiting', chip: 'bg-slate-100 text-muted border-slate-200' },
};

const STATE_META: Record<PanelState, { label: string; pill: string }> = {
  completed:    { label: 'Completed',    pill: 'bg-green-100 text-green-700 border border-green-200' },
  in_progress:  { label: 'In Progress',  pill: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
  ready_for_qc: { label: 'QA/QC Review', pill: 'bg-amber-100 text-amber-700 border border-amber-200' },
  paused:       { label: 'Paused',       pill: 'bg-slate-100 text-muted border border-slate-200' },
  assigned:     { label: 'Assigned',     pill: 'bg-blue-100 text-blue-700 border border-blue-200' },
  unassigned:   { label: 'Not Assigned', pill: 'bg-red-100 text-red-700 border border-red-200' },
};

const BUCKET_ORDER: StatusBucket[] = ['completed', 'in_progress', 'pending_review', 'not_started'];

interface PanelRow {
  key: string;
  frameId: string;
  projectCode: string;
  projectName: string;
  panelName: string;
  technician: string;
  technicianId: number | null;
  state: PanelState;
  bucket: StatusBucket;
  progress: number;
}

interface ProjectGroup {
  projectCode: string;
  projectName: string;
  panels: PanelRow[];
  overallProgress: number;
  bucketCounts: Record<StatusBucket, number>;
  workflow: 'completed' | 'in_progress' | 'pending_review' | 'not_started';
  isFocused: boolean;
}

interface SummaryTabProps {
  projectCode?: string;
  panelId?: string;
  selectedTechId?: string;
  selectedTechName?: string;
}

function effectiveState(a: any | undefined): PanelState {
  if (!a) return 'unassigned';
  if (a.status === 'completed') return 'completed';
  if (a.qc_status === 'ready_for_qc' || a.review_status === 'ready_for_qc') return 'ready_for_qc';
  if (a.status === 'paused') return 'paused';
  if (a.status === 'in_progress') return 'in_progress';
  return 'assigned';
}

function toBucket(state: PanelState): StatusBucket {
  if (state === 'completed') return 'completed';
  if (state === 'ready_for_qc') return 'pending_review';
  if (state === 'in_progress' || state === 'paused') return 'in_progress';
  return 'not_started';
}

function projectWorkflow(panels: PanelRow[]): ProjectGroup['workflow'] {
  if (panels.length === 0) return 'not_started';
  const counts = Object.fromEntries(BUCKET_ORDER.map(b => [b, 0])) as Record<StatusBucket, number>;
  for (const p of panels) counts[p.bucket] += 1;
  if (counts.in_progress > 0) return 'in_progress';
  if (counts.pending_review > 0) return 'pending_review';
  if (counts.completed === panels.length) return 'completed';
  return 'not_started';
}

export default function SummaryTab({
  projectCode = '',
  panelId = '',
  selectedTechId = '',
  selectedTechName,
}: SummaryTabProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [frames, setFrames] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeBucket, setActiveBucket] = useState<StatusBucket | null>(null);
  const focusedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const projs = await projectsApi.list().catch(() => []);
      const frameLists = await Promise.all(
        (projs as Project[]).map(p =>
          projectsApi.frames(p.code)
            .then(fs => fs.map((f: any) => ({ ...f, project_code: p.code })))
            .catch(() => []),
        ),
      );
      if (cancelled) return;
      setProjects(projs);
      setFrames(frameLists.flat());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadAssignments = useCallback(() => {
    supervisorApi.allPanels().then(setAssignments).catch(() => {});
  }, []);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  useDwesRefresh(loadAssignments, { listenFrames: false });

  useEffect(() => {
    setActiveBucket(null);
    setSearch('');
  }, [selectedTechId]);

  useEffect(() => {
    if (projectCode && focusedRef.current) {
      focusedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [projectCode, loading]);

  const projectName = useMemo(() => {
    const m = new Map(projects.map(p => [p.code, p.name]));
    return (code: string) => m.get(code) || code;
  }, [projects]);

  const assignmentByFrame = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of assignments) if (!m.has(a.frame_id)) m.set(a.frame_id, a);
    return m;
  }, [assignments]);

  const rows: PanelRow[] = useMemo(() => {
    const techId = selectedTechId ? parseInt(selectedTechId, 10) : null;
    return frames
      .map(f => {
        const a = assignmentByFrame.get(f.id);
        const state = effectiveState(a);
        return {
          key: `${f.project_code}:${f.id}`,
          frameId: f.id,
          projectCode: f.project_code,
          projectName: projectName(f.project_code),
          panelName: a?.panel_display_name || f.panel_name || f.id,
          technician: a?.technician_name || a?.technician_username || '—',
          technicianId: a?.technician_id ?? null,
          state,
          bucket: toBucket(state),
          progress: a?.kpi ?? 0,
        };
      })
      .filter(r => {
        if (projectCode && r.projectCode !== projectCode) return false;
        if (panelId && r.frameId !== panelId) return false;
        if (techId == null || Number.isNaN(techId)) return true;
        return r.technicianId === techId;
      });
  }, [frames, assignmentByFrame, projectName, selectedTechId, projectCode, panelId]);

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
      const bucketCounts = Object.fromEntries(BUCKET_ORDER.map(b => [b, 0])) as Record<StatusBucket, number>;
      for (const p of panels) bucketCounts[p.bucket] += 1;

      const filteredPanels = panels.filter(p => {
        if (activeBucket && p.bucket !== activeBucket) return false;
        if (!q) return true;
        return (
          p.projectName.toLowerCase().includes(q) ||
          p.panelName.toLowerCase().includes(q) ||
          p.technician.toLowerCase().includes(q) ||
          STATE_META[p.state].label.toLowerCase().includes(q) ||
          BUCKET_META[p.bucket].label.toLowerCase().includes(q)
        );
      });

      if (filteredPanels.length === 0 && (activeBucket || q)) continue;

      const overallProgress = panels.length
        ? Math.round(panels.reduce((s, p) => s + p.progress, 0) / panels.length)
        : 0;

      groups.push({
        projectCode: code,
        projectName: panels[0]?.projectName ?? projectName(code),
        panels: filteredPanels,
        overallProgress,
        bucketCounts,
        workflow: projectWorkflow(panels),
        isFocused: Boolean(projectCode && code === projectCode),
      });
    }

    return groups.sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [rows, search, activeBucket, projectCode, projectName]);

  const totalPanels = rows.length;
  const visiblePanels = projectGroups.reduce((n, g) => n + g.panels.length, 0);

  if (loading) {
    return <DwesLoadingState label="Loading panel status…" />;
  }

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <OperationsCentreSection />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project, panel, or status"
            className="form-input pl-9"
          />
        </div>
        <button
          type="button"
          onClick={loadAssignments}
          title="Refresh"
          className="btn-secondary !h-11 !w-11 !px-0 shrink-0"
        >
          <RefreshCw size={16} />
        </button>
        <span className="text-[13px] text-muted shrink-0">
          {visiblePanels} of {totalPanels} panel{totalPanels !== 1 ? 's' : ''}
          {projectGroups.length > 0 && ` · ${projectGroups.length} project${projectGroups.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Context + bucket filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {selectedTechName && (
          <span className="text-[13px] text-muted mr-1">
            For <span className="font-semibold text-primary">{selectedTechName}</span>
          </span>
        )}
        {projectCode && !panelId && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Project filter active
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                isActive ? 'ring-2 ring-blue-400 ' + meta.chip : meta.chip + ' opacity-80 hover:opacity-100'
              }`}
              title={isActive ? 'Clear filter' : `Show ${meta.label} only`}
            >
              {meta.short}
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
        {activeBucket && (
          <button
            type="button"
            onClick={() => setActiveBucket(null)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-1"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Project cards */}
      {projectGroups.length === 0 ? (
        <div className="empty-state">
          <p className="empty-text">
            {selectedTechName
              ? `No panels for ${selectedTechName}${activeBucket ? ` in ${BUCKET_META[activeBucket].label}` : ''}.`
              : projectCode
                ? 'No panels match the current filters.'
                : 'No panel data available.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {projectGroups.map(group => (
            <ProjectStatusCard
              key={group.projectCode}
              group={group}
              focusedPanelId={panelId}
              showTechnician={!selectedTechId}
              cardRef={group.isFocused ? focusedRef : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Project card with nested panel rows ── */

interface ProjectStatusCardProps {
  group: ProjectGroup;
  focusedPanelId?: string;
  showTechnician: boolean;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

function ProjectStatusCard({ group, focusedPanelId, showTechnician, cardRef }: ProjectStatusCardProps) {
  const { projectCode, projectName, panels, overallProgress, bucketCounts, workflow, isFocused } = group;
  const isActive = workflow === 'in_progress';

  const headerGrad = isActive
    ? 'bg-gradient-to-r from-[var(--t-accent-soft,rgba(219,234,254,0.9))] to-[var(--t-card,#fff)]'
    : workflow === 'pending_review'
      ? 'bg-gradient-to-r from-[var(--t-warning-soft,rgba(254,243,199,0.9))] to-[var(--t-card,#fff)]'
      : workflow === 'completed'
        ? 'bg-gradient-to-r from-[var(--t-success-soft,rgba(220,252,231,0.9))] to-[var(--t-card,#fff)]'
        : '';

  return (
    <article
      ref={cardRef}
      className={`rounded-[12px] overflow-hidden transition-shadow ${
        isFocused
          ? 'ring-2 ring-[var(--t-accent,#2563EB)] shadow-md'
          : 'shadow-sm hover:shadow-md'
      }`}
      style={{
        background: 'var(--t-card, #fff)',
        border: `1px solid ${isActive ? 'var(--t-accent, #93C5FD)' : 'var(--t-border, #E2E8F0)'}`,
        boxShadow: isFocused ? undefined : 'var(--t-card-shadow, 0 1px 2px rgba(0,0,0,0.06))',
      }}
    >
      {/* Project header */}
      <div className={`px-4 pt-4 pb-3 ${headerGrad}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-[var(--t-text,#0F172A)] truncate" title={projectName}>
                {projectName}
              </h3>
              <span className="text-[11px] font-semibold text-[var(--t-muted,#64748B)] tabular-nums">
                {projectCode}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {BUCKET_ORDER.map(bucket => {
                const count = bucketCounts[bucket];
                if (count === 0) return null;
                const meta = BUCKET_META[bucket];
                return (
                  <span
                    key={bucket}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.chip}`}
                  >
                    {count} {meta.short}
                  </span>
                );
              })}
              <span className="text-[11px] text-[var(--t-muted,#64748B)] ml-1">
                {panels.length} panel{panels.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[20px] font-bold text-[var(--t-text,#0F172A)] leading-none tabular-nums">
              {overallProgress}%
            </span>
            <span className="text-[10px] font-bold text-[var(--t-muted,#94A3B8)] uppercase tracking-wider mt-0.5">
              Overall
            </span>
          </div>
        </div>

        {/* Project progress bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="progress-track flex-1 h-[6px]">
            <div
              className={`progress-fill h-full ${workflow === 'completed' ? 'progress-fill-green' : workflow === 'in_progress' ? 'progress-fill-orange' : ''}`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Nested panel rows */}
      <div className="border-t border-[var(--t-border,#E2E8F0)] divide-y divide-[var(--t-border,#E2E8F0)]">
        {panels.map(panel => {
          const meta = STATE_META[panel.state];
          const isPanelFocused = Boolean(focusedPanelId && panel.frameId === focusedPanelId);
          return (
            <div
              key={panel.key}
              className={`px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 transition-colors ${
                isPanelFocused ? 'bg-[var(--t-accent-soft,rgba(219,234,254,0.5))]' : 'hover:bg-[var(--t-surface-2,#F8FAFC)]'
              }`}
            >
              <span
                className="text-[13px] font-semibold text-[var(--t-text,#0F172A)] min-w-[120px] flex-1 truncate"
                title={panel.panelName}
              >
                {panel.panelName}
              </span>

              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${meta.pill}`}>
                {meta.label}
              </span>

              {showTechnician && (
                <span className="text-[11px] text-[var(--t-muted,#64748B)] truncate max-w-[140px] shrink-0 hidden sm:inline">
                  {panel.technician}
                </span>
              )}

              <div className="flex items-center gap-2 min-w-[100px] flex-1 sm:flex-initial sm:max-w-[140px]">
                <div className="progress-track flex-1 h-1.5">
                  <div
                    className={`progress-fill h-full ${panel.bucket === 'completed' ? 'progress-fill-green' : panel.bucket === 'in_progress' ? 'progress-fill-orange' : ''}`}
                    style={{ width: `${panel.progress}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-[var(--t-muted,#64748B)] w-8 text-right tabular-nums shrink-0">
                  {panel.progress}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
