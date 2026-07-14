import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Modal from '../Modal';
import DeleteConfirmModal, { type DeleteScopeId } from '../ui/DeleteConfirmModal';
import { projectsApi, supervisorApi, techApi, usersApi } from '../../services/api';
import { emitFramesChanged } from '../../utils/projectFramesEvents';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { useDwesRefresh, type RefreshOptions } from '../../hooks/useDwesRefresh';
import Toast from '../ui/Toast';
import TechnicianStatusIndicator from '../ui/TechnicianStatusIndicator';
import {
  CHANGEOVER_REASONS,
  type ChangeoverAssignment,
  type ChangeoverReason,
} from '../assignment/MidChangeoverModal';
import DuplicatePanelWarning from './DuplicatePanelWarning';
import { usePanelDuplicateGuard } from '../../hooks/usePanelDuplicateGuard';
import {
  type AssignmentRow,
  type AuditEntry,
  type BoardCard,
  type BoardLaneId,
  type FrameMeta,
  type QueueItem,
  type TechFilterState,
  type TechResource,
  type TechResourceStatus,
  buildAssignmentBoard,
  buildRecommendations,
  buildShopFloorKpis,
  buildTechResources,
  detectNewlyCompletedTechs,
  filterTechResources,
  findNextQueueForTech,
  formatAuditAction,
  loadAssignmentQueue,
  loadAutoNextEnabled,
  pickBestTechnician,
  saveAssignmentQueue,
  saveAutoNextEnabled,
  techHasConflictingPanel,
  uniqueFilterOptions,
} from '../../utils/assignmentCenterUtils';
import {
  Activity,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Columns3,
  LayoutGrid,
  ListChecks,
  RefreshCw,
  Search,
  Star,
  TriangleAlert,
  UserMinus,
  UserPlus,
  Users,
  Zap,
} from '../ui/icons';

export type TechnicianWorkflowSection = 'assign' | 'deassign' | 'changeover';

export interface TechnicianWorkflowModalProps {
  onClose: () => void;
  initialSection?: TechnicianWorkflowSection;
  projectCode: string;
  panelId: string;
  projectName: string;
  panelName: string;
  cableCount?: number;
}

const SECTIONS: { key: TechnicianWorkflowSection; label: string; icon: typeof UserPlus }[] = [
  { key: 'assign', label: 'Assign', icon: UserPlus },
  { key: 'deassign', label: 'De-assign', icon: UserMinus },
  { key: 'changeover', label: 'Changeover', icon: ArrowLeftRight },
];

type WorkflowStatus = 'unassigned' | 'assigned' | 'in_progress' | 'paused' | 'completed' | 'changeover';

const STATUS_META: Record<WorkflowStatus, { label: string; chip: string }> = {
  unassigned: { label: 'Unassigned', chip: 'twf-status--idle' },
  assigned: { label: 'Assigned', chip: 'twf-status--assigned' },
  in_progress: { label: 'In Progress', chip: 'twf-status--progress' },
  paused: { label: 'Paused', chip: 'twf-status--paused' },
  completed: { label: 'Completed', chip: 'twf-status--done' },
  changeover: { label: 'Changeover Eligible', chip: 'twf-status--changeover' },
};

const STATUS_FILTERS: Array<{ key: TechResourceStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Free' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'working', label: 'Working' },
  { key: 'busy', label: 'Busy' },
];

const BOARD_LANES: Array<{ id: BoardLaneId; label: string; shortLabel: string; hint: string }> = [
  { id: 'current', label: 'Current Assignment', shortLabel: 'Current', hint: 'Focus panel' },
  { id: 'waiting', label: 'Waiting Queue', shortLabel: 'Queue', hint: 'Queued panels' },
  { id: 'in_progress', label: 'In Progress', shortLabel: 'Active', hint: 'Shop floor' },
  { id: 'completed_today', label: 'Completed Today', shortLabel: 'Done', hint: 'Finished today' },
  { id: 'available', label: 'Available Panels', shortLabel: 'Open', hint: 'Unassigned' },
];

function resolveWorkflowStatus(
  assignment: AssignmentRow | null,
  changeoverEligible: boolean,
): WorkflowStatus {
  if (!assignment) return 'unassigned';
  if (changeoverEligible && (assignment.status === 'in_progress' || assignment.status === 'paused')) {
    return 'changeover';
  }
  const s = String(assignment.status || 'assigned');
  if (s === 'in_progress') return 'in_progress';
  if (s === 'paused') return 'paused';
  if (s === 'completed') return 'completed';
  return 'assigned';
}

function toChangeoverAssignment(row: AssignmentRow): ChangeoverAssignment {
  return {
    id: row.id,
    project_code: row.project_code,
    frame_id: row.frame_id,
    panel_name: row.panel_name,
    status: row.status ?? undefined,
    technician_id: row.technician_id,
    technician_name: row.technician_name || '',
    completed_cables: (row as any).completed_cables,
    remaining_cables: (row as any).remaining_cables,
    cables_total: row.cables_total ?? undefined,
    pause_reason: row.pause_reason ?? undefined,
  };
}

function queueItemId(projectCode: string, panelId: string): string {
  return `${projectCode}::${panelId}`;
}

const EMPTY_FILTERS: TechFilterState = {
  query: '',
  status: 'all',
  project: '',
  voltage: '',
  panelType: '',
  skill: 'all',
};

export default function SmartAssignmentCenter({
  onClose,
  initialSection = 'assign',
  projectCode,
  panelId,
  projectName,
  panelName,
  cableCount = 0,
}: TechnicianWorkflowModalProps) {
  const [section, setSection] = useState<TechnicianWorkflowSection>(initialSection);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'warn'>('success');

  const [frameCableCount, setFrameCableCount] = useState(cableCount);
  const [focusVoltage, setFocusVoltage] = useState<string | null>(null);
  const [focusPanelType, setFocusPanelType] = useState<string | null>(null);
  const [projectFrames, setProjectFrames] = useState<FrameMeta[]>([]);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [changeoverRow, setChangeoverRow] = useState<AssignmentRow | null>(null);
  const [allAssignments, setAllAssignments] = useState<AssignmentRow[]>([]);
  const [techUsers, setTechUsers] = useState<any[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<TechFilterState>(EMPTY_FILTERS);
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const [dragTechId, setDragTechId] = useState<number | null>(null);
  const [dragOverLane, setDragOverLane] = useState<BoardLaneId | null>(null);

  const [queue, setQueue] = useState<QueueItem[]>(() => loadAssignmentQueue());
  const [autoNextEnabled, setAutoNextEnabled] = useState(() => loadAutoNextEnabled());
  const prevAssignmentsRef = useRef<AssignmentRow[]>([]);
  const autoAssignInFlight = useRef(false);

  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState('');

  const [changeoverTech, setChangeoverTech] = useState('');
  const [changeoverReason, setChangeoverReason] = useState<ChangeoverReason | ''>('');
  const [changeoverNotes, setChangeoverNotes] = useState('');
  const [changeoverSaving, setChangeoverSaving] = useState(false);
  const [changeoverError, setChangeoverError] = useState('');
  const [showDeassignConfirm, setShowDeassignConfirm] = useState(false);
  const [deassigning, setDeassigning] = useState(false);

  useEffect(() => { setSection(initialSection); }, [initialSection]);

  useEffect(() => {
    usersApi.technicians()
      .then(list => setTechUsers((list || []).filter((t: any) => t.is_active !== false)))
      .catch(() => {});
  }, []);

  const showToast = (message: string, tone: 'success' | 'warn' = 'success') => {
    setToastTone(tone);
    setToast(message);
  };

  const loadContext = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const [frames, panels, changeovers, audit] = await Promise.all([
        projectsApi.frames(projectCode).catch(() => []),
        supervisorApi.allPanels().catch(() => []),
        supervisorApi.pendingChangeovers().catch(() => []),
        techApi.audit(projectCode).catch(() => []),
      ]);

      const frameMetas: FrameMeta[] = (frames as any[]).map(f => ({
        id: f.id,
        panel_name: f.panel_name,
        project_code: projectCode,
        cable_count: f.cable_count,
        panel_type: f.panel_type ?? null,
        voltage_level: f.voltage_level ?? null,
        system_type: f.system_type ?? null,
      }));
      setProjectFrames(frameMetas);

      const frame = (frames as any[]).find(f => f.id === panelId);
      if (frame?.cable_count != null) setFrameCableCount(frame.cable_count);
      setFocusVoltage(frame?.voltage_level ?? null);
      setFocusPanelType(frame?.panel_type ?? null);

      const panelRows = panels as AssignmentRow[];
      setAllAssignments(panelRows);

      const panelAssignment = panelRows.find(
        a => a.project_code === projectCode && a.frame_id === panelId,
      );
      setAssignment(panelAssignment ?? null);

      const co = (changeovers as AssignmentRow[]).find(
        p => p.project_code === projectCode && p.frame_id === panelId,
      );
      setChangeoverRow(co ?? null);

      setAuditTrail(
        (audit as AuditEntry[])
          .filter(a => a.frame_id === panelId)
          .sort((a, b) => {
            const ta = new Date(String(a.created_at || 0)).getTime();
            const tb = new Date(String(b.created_at || 0)).getTime();
            return tb - ta;
          }),
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectCode, panelId]);

  useDwesRefresh(loadContext, { pollMs: 12_000, listenFrames: true, listenWorkflow: true });

  useEffect(() => { void loadContext(); }, [loadContext]);

  const scheduleReady = frameCableCount > 0;
  const duplicateGuard = usePanelDuplicateGuard(
    projectFrames.map(f => ({ id: f.id, panel_name: f.panel_name })),
    panelId,
    panelName,
  );
  const workflowBlocked = duplicateGuard.blocked;
  const changeoverEligible = Boolean(changeoverRow);
  const workflowStatus = resolveWorkflowStatus(assignment, changeoverEligible);
  const statusMeta = STATUS_META[workflowStatus];
  const canAssign = !assignment && scheduleReady && !workflowBlocked;
  const canDeassign = assignment?.status === 'assigned' && !workflowBlocked;
  const canChangeover = changeoverEligible && changeoverRow && !workflowBlocked;

  const techResources = useMemo(
    () => buildTechResources(techUsers, allAssignments, projectCode),
    [techUsers, allAssignments, projectCode],
  );

  const filteredTechs = useMemo(
    () => filterTechResources(techResources, filters),
    [techResources, filters],
  );

  const recommendations = useMemo(
    () => buildRecommendations(techResources, projectCode, allAssignments),
    [techResources, projectCode, allAssignments],
  );

  const bestPick = useMemo(
    () => pickBestTechnician(techResources, projectCode, allAssignments),
    [techResources, projectCode, allAssignments],
  );

  const selectedTechResource = useMemo(
    () => (selectedTechId != null ? techResources.find(t => t.id === selectedTechId) ?? null : null),
    [selectedTechId, techResources],
  );

  const assignConflict = useMemo(() => {
    if (selectedTechId == null) return null;
    return techHasConflictingPanel(selectedTechId, projectCode, panelId, allAssignments);
  }, [selectedTechId, projectCode, panelId, allAssignments]);

  const changeoverTarget = useMemo(
    () => (changeoverRow ? toChangeoverAssignment(changeoverRow) : null),
    [changeoverRow],
  );

  const panelInQueue = queue.some(q => q.projectCode === projectCode && q.panelId === panelId);

  const filterOptions = useMemo(
    () => uniqueFilterOptions(projectFrames, allAssignments),
    [projectFrames, allAssignments],
  );

  const board = useMemo(
    () => buildAssignmentBoard({
      focusProjectCode: projectCode,
      focusPanelId: panelId,
      focusPanelName: panelName,
      focusProjectName: projectName,
      focusAssignment: assignment,
      focusCableCount: frameCableCount,
      focusVoltage,
      focusPanelType,
      allAssignments,
      projectFrames,
      queue,
      filters,
    }),
    [
      projectCode, panelId, panelName, projectName, assignment, frameCableCount,
      focusVoltage, focusPanelType, allAssignments, projectFrames, queue, filters,
    ],
  );

  const kpis = useMemo(
    () => buildShopFloorKpis(techResources, queue, allAssignments, board.available.length),
    [techResources, queue, allAssignments, board.available.length],
  );

  const techNameById = useMemo(
    () => new Map(techResources.map(t => [t.id, t.full_name])),
    [techResources],
  );

  const persistQueue = useCallback((items: QueueItem[]) => {
    setQueue(items);
    saveAssignmentQueue(items);
  }, []);

  const handleAssign = useCallback(async (
    techId?: number,
    opts?: { silent?: boolean; targetProject?: string; targetPanel?: string; targetName?: string },
  ) => {
    const targetId = techId ?? selectedTechId;
    const targetProject = opts?.targetProject ?? projectCode;
    const targetPanel = opts?.targetPanel ?? panelId;
    const targetName = opts?.targetName ?? panelName;
    const isFocusPanel = targetProject === projectCode && targetPanel === panelId;

    if (targetId == null) return;
    if (isFocusPanel && !canAssign) return;

    if (isFocusPanel) {
      const conflict = techHasConflictingPanel(targetId, targetProject, targetPanel, allAssignments);
      if (conflict && !window.confirm(
        `${techResources.find(t => t.id === targetId)?.full_name ?? 'Technician'} is active on `
        + `${conflict.panel_name || conflict.frame_id} (${conflict.project_code}). Assign to ${targetName} anyway?`,
      )) {
        return;
      }
    }

    setAssignSaving(true);
    setAssignError('');
    try {
      await supervisorApi.assignFrame({
        project_code: targetProject,
        frame_id: targetPanel,
        technician_id: targetId,
      });
      setSelectedTechId(null);
      if (!opts?.silent) showToast('Technician assigned');
      emitFramesChanged({ projectCode: targetProject, frameId: targetPanel, action: 'updated' });
      emitWorkflowChanged({ scope: 'assignment', projectCode: targetProject, frameId: targetPanel });
      persistQueue(queue.filter(q => q.id !== queueItemId(targetProject, targetPanel)));
      await loadContext();
      if (isFocusPanel) setSection('deassign');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Assignment failed';
      setAssignError(msg);
      if (!opts?.silent) showToast(msg, 'warn');
      throw e;
    } finally {
      setAssignSaving(false);
    }
  }, [
    selectedTechId, projectCode, panelId, panelName, canAssign, allAssignments,
    techResources, queue, persistQueue, loadContext,
  ]);

  // Auto-next: when a tech completes a panel, try to assign their next queued panel.
  useEffect(() => {
    const prev = prevAssignmentsRef.current;
    const newlyDone = detectNewlyCompletedTechs(prev, allAssignments);
    prevAssignmentsRef.current = allAssignments;

    if (!autoNextEnabled || newlyDone.length === 0 || autoAssignInFlight.current) return;

    const run = async () => {
      autoAssignInFlight.current = true;
      try {
        let q = loadAssignmentQueue();
        for (const done of newlyDone) {
          const next = findNextQueueForTech(q, done.techId);
          if (!next) continue;

          // Mark auto-ready in queue UI even if assign fails (e.g. no schedule)
          q = q.map(item => (
            item.id === next.id
              ? { ...item, autoReady: true, preferredTechId: done.techId }
              : item
          ));
          persistQueue(q);

          const alreadyActive = allAssignments.some(
            a => a.project_code === next.projectCode
              && a.frame_id === next.panelId
              && (a.status === 'assigned' || a.status === 'in_progress' || a.status === 'paused'),
          );
          if (alreadyActive) continue;

          try {
            await supervisorApi.assignFrame({
              project_code: next.projectCode,
              frame_id: next.panelId,
              technician_id: done.techId,
            });
            q = q.filter(item => item.id !== next.id);
            persistQueue(q);
            emitFramesChanged({
              projectCode: next.projectCode,
              frameId: next.panelId,
              action: 'updated',
            });
            emitWorkflowChanged({
              scope: 'assignment',
              projectCode: next.projectCode,
              frameId: next.panelId,
            });
            showToast(
              `Auto-assigned ${next.panelName} → tech #${done.techId} (queue)`,
              'success',
            );
            await loadContext();
          } catch {
            showToast(
              `${next.panelName} marked auto-ready — supervisor confirm required`,
              'warn',
            );
          }
        }
      } finally {
        autoAssignInFlight.current = false;
      }
    };

    void run();
  }, [allAssignments, autoNextEnabled, persistQueue, loadContext]);

  useEffect(() => {
    if (section === 'changeover' && changeoverTarget) {
      setChangeoverTech('');
      setChangeoverReason('');
      setChangeoverNotes('');
      setChangeoverError('');
    }
  }, [section, changeoverTarget]);

  const addToQueue = (preferredTechId?: number | null) => {
    if (panelInQueue) {
      showToast('Panel already in waiting queue', 'warn');
      return;
    }
    const item: QueueItem = {
      id: queueItemId(projectCode, panelId),
      projectCode,
      panelId,
      panelName,
      projectName,
      priority: queue.length + 1,
      addedAt: new Date().toISOString(),
      cableCount: frameCableCount,
      preferredTechId: preferredTechId ?? selectedTechId,
      autoReady: false,
    };
    persistQueue([...queue, item]);
    showToast(`${panelName} added to waiting queue`);
  };

  const removeFromQueue = (id: string) => {
    persistQueue(queue.filter(q => q.id !== id));
  };

  const handleDeassign = () => {
    if (!assignment?.id || !canDeassign) return;
    setShowDeassignConfirm(true);
  };

  const confirmDeassign = async (_scope: DeleteScopeId) => {
    if (!assignment?.id || !canDeassign) return;
    setDeassigning(true);
    try {
      await techApi.delete(assignment.id).catch(() => {});
      showToast('Assignment removed');
      emitFramesChanged({ projectCode, frameId: panelId, action: 'updated' });
      emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
      await loadContext();
      setShowDeassignConfirm(false);
      setSection('assign');
    } finally {
      setDeassigning(false);
    }
  };

  const handleChangeover = async () => {
    if (!changeoverTarget || !changeoverTech || !changeoverReason) {
      setChangeoverError('Select replacement technician and reason');
      return;
    }
    setChangeoverSaving(true);
    setChangeoverError('');
    try {
      await supervisorApi.midChangeover({
        old_assignment_id: changeoverTarget.id,
        new_technician_id: parseInt(changeoverTech, 10),
        changeover_reason: changeoverReason,
        reason_notes: changeoverNotes.trim() || undefined,
      });
      showToast('Mid-changeover completed');
      emitFramesChanged({ projectCode, frameId: panelId, action: 'updated' });
      emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
      await loadContext();
      setSection('deassign');
    } catch (e: any) {
      setChangeoverError(e?.response?.data?.message || 'Changeover failed');
    } finally {
      setChangeoverSaving(false);
    }
  };

  const handleAssignBest = () => {
    if (!canAssign || !bestPick) {
      showToast('No suitable technician available', 'warn');
      return;
    }
    setSelectedTechId(bestPick.techId);
    setSection('assign');
    void handleAssign(bestPick.techId);
  };

  const onTechDragStart = (techId: number) => {
    if (!canAssign) return;
    setDragTechId(techId);
  };

  const onDropToLane = (e: React.DragEvent, lane: BoardLaneId) => {
    e.preventDefault();
    setDragOverLane(null);
    const raw = e.dataTransfer.getData('text/plain');
    const techId = parseInt(raw || String(dragTechId ?? ''), 10);
    setDragTechId(null);
    if (!Number.isFinite(techId)) return;

    if (lane === 'current' || lane === 'available') {
      if (!canAssign) return;
      setSelectedTechId(techId);
      void handleAssign(techId);
      return;
    }
    if (lane === 'waiting') {
      setSelectedTechId(techId);
      addToQueue(techId);
    }
  };

  const toggleAutoNext = () => {
    const next = !autoNextEnabled;
    setAutoNextEnabled(next);
    saveAutoNextEnabled(next);
    showToast(next ? 'Auto-next on complete enabled' : 'Auto-next disabled', 'warn');
  };

  return (
    <Modal
      title="Production Assignment"
      subtitle={`${projectCode} · ${panelName}${frameCableCount > 0 ? ` · ${frameCableCount} cables` : ''}`}
      onClose={onClose}
      size="fullscreen"
      bodyClassName="modal-body-flush"
    >
      <div className="sac-workspace glass-exempt">
        {/* KPI strip */}
        <div className="sac-kpi-strip" role="status" aria-label="Shop floor counters">
          <KpiTile icon={<Users size={14} />} label="Available" value={kpis.availableTechs} tone="idle" />
          <KpiTile icon={<Activity size={14} />} label="Working" value={kpis.working} tone="work" />
          <KpiTile icon={<ListChecks size={14} />} label="Waiting" value={kpis.waiting} tone="wait" />
          <KpiTile icon={<LayoutGrid size={14} />} label="Unassigned" value={kpis.unassignedPanels} tone="open" />
          <KpiTile icon={<CheckCircle2 size={14} />} label="Done Today" value={kpis.completedToday} tone="done" />
        </div>

        {/* Toolbar */}
        <header className="sac-toolbar glass-surface--subtle">
          <div className="sac-toolbar-left">
            <div className="sac-mode-tabs" role="tablist" aria-label="Assignment actions">
              {SECTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={section === key}
                  className={`sac-mode-tab ${section === key ? 'is-active' : ''}`}
                  onClick={() => setSection(key)}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="sac-assign-best"
              disabled={!canAssign || !bestPick || assignSaving}
              onClick={handleAssignBest}
              title={bestPick ? `Heuristic: ${bestPick.techName} (${bestPick.score}%)` : 'No pick'}
            >
              <Zap size={15} />
              <span className="sac-assign-best-label">Assign Best Technician</span>
              {bestPick && <span className="sac-assign-best-score">{bestPick.score}%</span>}
            </button>
          </div>
          <div className="sac-toolbar-right">
            <label className="sac-auto-toggle" title="When a panel completes, try assign next queued panel via assignFrame">
              <input
                type="checkbox"
                checked={autoNextEnabled}
                onChange={toggleAutoNext}
              />
              <span>Auto-next</span>
            </label>
            <button
              type="button"
              className="twf-refresh-btn"
              onClick={() => void loadContext()}
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </header>

        {/* Quick filters */}
        <div className="sac-filters-bar">
          <div className="sac-search-wrap sac-search-wrap--bar">
            <Search size={14} className="sac-search-icon" />
            <input
              type="search"
              className="sac-search-input"
              placeholder="Search tech, panel, project…"
              value={filters.query}
              onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
              aria-label="Search"
            />
          </div>
          <select
            className="sac-filter-select"
            value={filters.project}
            onChange={e => setFilters(f => ({ ...f, project: e.target.value }))}
            aria-label="Filter by project"
          >
            <option value="">Project</option>
            {filterOptions.projects.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="sac-filter-select"
            value={filters.voltage}
            onChange={e => setFilters(f => ({ ...f, voltage: e.target.value }))}
            aria-label="Filter by voltage"
          >
            <option value="">Voltage</option>
            {filterOptions.voltages.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select
            className="sac-filter-select"
            value={filters.panelType}
            onChange={e => setFilters(f => ({ ...f, panelType: e.target.value }))}
            aria-label="Filter by panel type"
          >
            <option value="">Panel type</option>
            {filterOptions.panelTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="sac-filter-select"
            value={filters.skill}
            onChange={e => setFilters(f => ({
              ...f,
              skill: e.target.value as TechFilterState['skill'],
            }))}
            aria-label="Filter by skill"
          >
            <option value="all">Skill</option>
            <option value="experienced">Project experience</option>
            <option value="general">General</option>
          </select>
          <div className="sac-filter-chips" role="group" aria-label="Status">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                className={`sac-filter-chip ${filters.status === f.key ? 'is-active' : ''}`}
                onClick={() => setFilters(prev => ({ ...prev, status: f.key }))}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sac-bento">
          {/* Left — compact tech cards */}
          <aside className="sac-pane sac-pane--techs glass-surface">
            <div className="sac-pane-head sac-pane-head--compact">
              <h3 className="sac-pane-title">
                <Users size={15} />
                Technicians
                <span className="sac-count-pill">{filteredTechs.length}</span>
              </h3>
            </div>
            <div className="sac-tech-grid">
              {loading && filteredTechs.length === 0 && (
                <p className="sac-empty">Loading…</p>
              )}
              {!loading && filteredTechs.length === 0 && (
                <p className="sac-empty">No match</p>
              )}
              {filteredTechs.map(tech => (
                <TechnicianResourceCard
                  key={tech.id}
                  tech={tech}
                  selected={selectedTechId === tech.id}
                  draggable={canAssign || section === 'assign'}
                  onSelect={() => {
                    setSelectedTechId(prev => (prev === tech.id ? null : tech.id));
                    if (section !== 'assign') setSection('assign');
                  }}
                  onDragStart={() => onTechDragStart(tech.id)}
                  onDragEnd={() => setDragTechId(null)}
                  onQuickAssign={() => {
                    if (!canAssign) return;
                    setSelectedTechId(tech.id);
                    void handleAssign(tech.id);
                  }}
                  canQuickAssign={canAssign}
                />
              ))}
            </div>
          </aside>

          {/* Center — Assignment Board + action dock */}
          <main className="sac-pane sac-pane--board glass-surface">
            <div className="sac-pane-head sac-pane-head--compact">
              <h3 className="sac-pane-title">
                <Columns3 size={15} />
                Assignment Board
              </h3>
              <span className={`twf-status-badge ${statusMeta.chip}`}>
                {loading ? '…' : statusMeta.label}
              </span>
            </div>

            {workflowBlocked && (
              <DuplicatePanelWarning
                panels={projectFrames.map(f => ({ id: f.id, panel_name: f.panel_name }))}
                selectedPanelId={panelId}
                className="mx-2 mb-1"
              />
            )}

            <div className="sac-board" role="list">
              {BOARD_LANES.map(lane => (
                <BoardLane
                  key={lane.id}
                  lane={lane}
                  cards={board[lane.id]}
                  isDropTarget={lane.id === 'current' || lane.id === 'waiting' || lane.id === 'available'}
                  isDragOver={dragOverLane === lane.id && dragTechId != null}
                  onDragOver={e => {
                    if (canAssign || lane.id === 'waiting') {
                      e.preventDefault();
                      setDragOverLane(lane.id);
                    }
                  }}
                  onDragLeave={() => setDragOverLane(prev => (prev === lane.id ? null : prev))}
                  onDrop={e => onDropToLane(e, lane.id)}
                  onQueueRemove={removeFromQueue}
                  focusPanelId={panelId}
                  techNameById={techNameById}
                />
              ))}
            </div>

            {/* Compact action dock */}
            <div
              className={`sac-action-dock ${canAssign ? 'is-droppable' : ''} ${dragTechId != null ? 'is-drag-over' : ''}`}
              onDragOver={e => { if (canAssign) e.preventDefault(); }}
              onDrop={e => onDropToLane(e, 'current')}
            >
              {section === 'assign' && (
                <div className="sac-action-pane sac-action-pane--compact">
                  {!scheduleReady && !workflowBlocked && (
                    <div className="tech-workflow-hint is-warn">
                      <TriangleAlert size={14} className="shrink-0" />
                      <span>Upload wiring schedule before assign.</span>
                    </div>
                  )}
                  {workflowBlocked && (
                    <div className="tech-workflow-hint is-warn">
                      <TriangleAlert size={14} className="shrink-0" />
                      <span>{duplicateGuard.message}</span>
                    </div>
                  )}
                  {assignment && !workflowBlocked && (
                    <div className="tech-workflow-hint is-info">
                      <span>
                        Assigned to <strong>{assignment.technician_name}</strong>.
                        Use De-assign or Changeover.
                      </span>
                    </div>
                  )}
                  {canAssign && (
                    <div className="sac-assign-row">
                      {selectedTechResource ? (
                        <div className="sac-selected-chip">
                          <span className="sac-avatar sac-avatar--sm">{selectedTechResource.initials}</span>
                          <span className="sac-selected-chip-name">{selectedTechResource.full_name}</span>
                          <TechnicianStatusIndicator status={selectedTechResource.status} compact />
                          {selectedTechResource.parallelMode === 'parallel_ok' && (
                            <span className="sac-parallel-badge sac-parallel-badge--ok">Parallel OK</span>
                          )}
                          {selectedTechResource.parallelMode === 'handover_required' && (
                            <span className="sac-parallel-badge sac-parallel-badge--warn">Mid-changeover only</span>
                          )}
                        </div>
                      ) : (
                        <p className="sac-drop-hint sac-drop-hint--inline">
                          Select / drag tech · or Assign Best
                        </p>
                      )}
                      {assignConflict && (
                        <div className="tech-workflow-hint is-warn">
                          <TriangleAlert size={13} className="shrink-0" />
                          <span>
                            Active on <strong>{assignConflict.panel_name || assignConflict.frame_id}</strong>
                          </span>
                        </div>
                      )}
                      {assignError && <div className="form-error">{assignError}</div>}
                      <div className="sac-assign-actions">
                        <button
                          type="button"
                          className="btn-primary sac-btn-compact"
                          disabled={selectedTechId == null || assignSaving}
                          onClick={() => void handleAssign()}
                        >
                          {assignSaving ? '…' : 'Assign'}
                        </button>
                        {canAssign && !panelInQueue && (
                          <button type="button" className="btn-secondary sac-btn-compact" onClick={() => addToQueue()}>
                            Queue
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {section === 'deassign' && (
                <div className="sac-action-pane sac-action-pane--compact">
                  {!assignment && (
                    <p className="tech-workflow-empty">No assignment on this panel.</p>
                  )}
                  {assignment && (
                    <div className="sac-deassign-row">
                      <div className="min-w-0">
                        <div className="sac-selected-chip-name">{assignment.technician_name}</div>
                        <div className="sac-tech-id">
                          {statusMeta.label}
                          {(assignment.kpi ?? 0) > 0 ? ` · ${assignment.kpi}%` : ''}
                        </div>
                      </div>
                      {canDeassign ? (
                        <button type="button" className="twf-deassign-btn sac-btn-compact" onClick={() => handleDeassign()}>
                          <UserMinus size={14} />
                          De-assign
                        </button>
                      ) : (
                        <p className="twf-hint-inline">De-assign only while status is Assigned.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {section === 'changeover' && (
                <div className="sac-action-pane sac-action-pane--compact">
                  {!canChangeover && (
                    <p className="tech-workflow-empty">
                      Not eligible — need in-progress/paused with partial work.
                    </p>
                  )}
                  {canChangeover && changeoverTarget && (
                    <div className="sac-changeover-grid">
                      <div className="sac-changeover-summary">
                        <span className="sac-meta-lbl">From</span>
                        <span className="sac-meta-val">{changeoverTarget.technician_name}</span>
                        <span className="sac-meta-lbl">Progress</span>
                        <span className="sac-meta-val">
                          {changeoverTarget.completed_cables ?? 0}/{changeoverTarget.cables_total ?? 0}
                        </span>
                      </div>
                      <label className="tech-workflow-field" htmlFor="sac-new-tech">
                        <span className="tech-workflow-field-label">Replacement</span>
                        <select
                          id="sac-new-tech"
                          className="form-select"
                          value={changeoverTech}
                          onChange={e => setChangeoverTech(e.target.value)}
                        >
                          <option value="">Select…</option>
                          {techUsers.filter(t => t.id !== changeoverTarget.technician_id).map(t => (
                            <option key={t.id} value={t.id}>{t.full_name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="tech-workflow-field" htmlFor="sac-reason">
                        <span className="tech-workflow-field-label">Reason</span>
                        <select
                          id="sac-reason"
                          className="form-select"
                          value={changeoverReason}
                          onChange={e => setChangeoverReason(e.target.value as ChangeoverReason)}
                        >
                          <option value="">Select…</option>
                          {CHANGEOVER_REASONS.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <label className="tech-workflow-field sac-changeover-notes" htmlFor="sac-notes">
                        <span className="tech-workflow-field-label">Notes</span>
                        <textarea
                          id="sac-notes"
                          className="form-textarea"
                          rows={1}
                          value={changeoverNotes}
                          onChange={e => setChangeoverNotes(e.target.value)}
                          placeholder="Optional…"
                        />
                      </label>
                      {changeoverError && <div className="form-error">{changeoverError}</div>}
                      <button
                        type="button"
                        className="btn-primary sac-btn-compact"
                        disabled={changeoverSaving || !changeoverTech || !changeoverReason}
                        onClick={() => void handleChangeover()}
                      >
                        {changeoverSaving ? '…' : 'Confirm changeover'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* Right — recommendations + compact timeline */}
          <aside className="sac-pane sac-pane--side glass-surface">
            <section className="sac-side-block">
              <div className="sac-side-head">
                <h3 className="sac-pane-title">
                  <Star size={14} />
                  Top picks
                </h3>
              </div>
              <ul className="sac-rec-list">
                {recommendations.map(rec => (
                  <li key={rec.techId} className="sac-rec-item">
                    <div className="sac-rec-top">
                      <span className="sac-rec-name">{rec.techName}</span>
                      <span className="sac-rec-score">{rec.score}%</span>
                    </div>
                    <p className="sac-rec-reasons" title={rec.reasons.join(' · ')}>
                      {rec.reasons.join(' · ')}
                    </p>
                    {canAssign && (
                      <button
                        type="button"
                        className="sac-rec-assign"
                        disabled={assignSaving}
                        onClick={() => {
                          setSelectedTechId(rec.techId);
                          setSection('assign');
                          void handleAssign(rec.techId);
                        }}
                      >
                        Assign
                      </button>
                    )}
                  </li>
                ))}
                {recommendations.length === 0 && (
                  <li className="sac-empty sac-empty--compact">No recommendations</li>
                )}
              </ul>
            </section>

            <section className="sac-side-block sac-side-block--timeline">
              <div className="sac-side-head">
                <h3 className="sac-pane-title">
                  <Clock size={14} />
                  Recent
                </h3>
              </div>
              {auditTrail.length === 0 ? (
                <p className="sac-empty sac-empty--compact">No recent changes</p>
              ) : (
                <ol className="sac-timeline">
                  {auditTrail.slice(0, 8).map(entry => (
                    <li key={entry.id} className="sac-timeline-item">
                      <div className="sac-timeline-dot" />
                      <div className="sac-timeline-body">
                        <div className="sac-timeline-action">{formatAuditAction(entry.action)}</div>
                        <div className="sac-timeline-detail">
                          {entry.technician_name || 'Tech'}
                          {entry.details ? ` — ${entry.details}` : ''}
                        </div>
                        {entry.created_at && (
                          <time className="sac-timeline-time" dateTime={String(entry.created_at)}>
                            {new Date(String(entry.created_at)).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </div>
      </div>

      {toast && (
        <Toast message={toast} tone={toastTone} onDismiss={() => setToast(null)} />
      )}

      {showDeassignConfirm && assignment && (
        <DeleteConfirmModal
          title="De-assign technician"
          subtitle="Removes this technician from the selected panel."
          resourceKind="assignment"
          itemLabel={assignment.technician_name || 'Technician'}
          parentProject={{ code: projectCode, name: projectName }}
          fields={[
            { label: 'Panel', value: panelName },
            { label: 'Status', value: String(assignment.status || 'assigned') },
          ]}
          sections={[
            {
              id: 'removed',
              title: 'Removed',
              icon: 'users',
              items: [
                `Assignment for ${assignment.technician_name}`,
                `Panel ${panelName}`,
              ],
            },
            {
              id: 'retained',
              title: 'Not affected',
              icon: 'shield',
              defaultExpanded: false,
              badge: 'kept',
              items: ['Panel wiring progress and project files'],
            },
          ]}
          scopes={[
            {
              id: 'item_only',
              label: 'Delete selected assignment only',
              description: 'De-assigns this technician. Panel data stays.',
            },
          ]}
          defaultScope="item_only"
          backup={{ status: 'skipped', note: 'De-assign does not dump the database.' }}
          warningText={`Remove ${assignment.technician_name} from ${panelName}?`}
          confirmCheckboxLabel={`I confirm de-assigning ${assignment.technician_name} from ${panelName}.`}
          confirmButtonLabel="De-assign"
          deleting={deassigning}
          onClose={() => { if (!deassigning) setShowDeassignConfirm(false); }}
          onConfirm={confirmDeassign}
        />
      )}
    </Modal>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: 'idle' | 'work' | 'wait' | 'open' | 'done';
}) {
  return (
    <div className={`sac-kpi-tile sac-kpi-tile--${tone}`}>
      <span className="sac-kpi-icon">{icon}</span>
      <span className="sac-kpi-val">{value}</span>
      <span className="sac-kpi-lbl">{label}</span>
    </div>
  );
}

function BoardLane({
  lane,
  cards,
  isDropTarget,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onQueueRemove,
  focusPanelId,
  techNameById,
}: {
  lane: { id: BoardLaneId; label: string; shortLabel: string; hint: string };
  cards: BoardCard[];
  isDropTarget: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onQueueRemove: (id: string) => void;
  focusPanelId: string;
  techNameById: Map<number, string>;
}) {
  return (
    <section
      className={`sac-lane ${isDropTarget ? 'is-droppable' : ''} ${isDragOver ? 'is-drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label={lane.label}
    >
      <header className="sac-lane-head">
        <span className="sac-lane-title" title={lane.label}>
          <span className="sac-lane-title-full">{lane.label}</span>
          <span className="sac-lane-title-short">{lane.shortLabel}</span>
        </span>
        <span className="sac-count-pill">{cards.length}</span>
      </header>
      <div className="sac-lane-body">
        {cards.length === 0 && (
          <p className="sac-lane-empty">{lane.hint}</p>
        )}
        {cards.map(card => {
          const queueTechName = card.techId != null ? techNameById.get(card.techId) : null;
          return (
          <article
            key={card.key}
            className={`sac-board-card ${card.isFocus || card.panelId === focusPanelId ? 'is-focus' : ''} ${card.autoReady ? 'is-auto-ready' : ''}`}
          >
            <div className="sac-board-card-top">
              <span className="sac-board-panel">{card.panelName}</span>
              {card.kpi != null && card.kpi > 0 && (
                <span className="sac-board-kpi">{card.kpi}%</span>
              )}
            </div>
            <div className="sac-board-meta">
              <span className="truncate">{card.projectCode}</span>
              {(card.techName || queueTechName) && (
                <span className="truncate">· {card.techName || queueTechName}</span>
              )}
            </div>
            <div className="sac-board-tags">
              <span className="sac-board-status">{card.statusLabel}</span>
              {card.cableCount != null && card.cableCount > 0 && (
                <span className="sac-board-tag">{card.cableCount}c</span>
              )}
              {card.voltage && <span className="sac-board-tag">{card.voltage}</span>}
              {card.panelType && <span className="sac-board-tag">{card.panelType}</span>}
              {card.autoReady && <span className="sac-board-tag sac-board-tag--ready">Auto-ready</span>}
              {card.lane === 'waiting' && (
                <button
                  type="button"
                  className="sac-queue-remove"
                  onClick={() => onQueueRemove(`${card.projectCode}::${card.panelId}`)}
                  aria-label="Remove from queue"
                >
                  ×
                </button>
              )}
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function TechnicianResourceCard({
  tech,
  selected,
  draggable,
  onSelect,
  onDragStart,
  onDragEnd,
  onQuickAssign,
  canQuickAssign,
}: {
  tech: TechResource;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onQuickAssign: () => void;
  canQuickAssign: boolean;
}) {
  return (
    <article
      className={[
        'sac-tech-card',
        selected ? 'is-selected' : '',
        draggable ? 'is-draggable' : '',
        `sac-tech-card--${tech.workloadTone}`,
        `sac-tech-card--status-${tech.status}`,
      ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      draggable={draggable}
      onDragStart={e => {
        if (!draggable) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', String(tech.id));
        e.dataTransfer.effectAllowed = 'copyMove';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <span className={`sac-tech-accent sac-tech-accent--${tech.workloadTone}`} aria-hidden />
      <div className="sac-tech-card-top">
        <span className="sac-avatar-wrap">
          <span className={`sac-avatar sac-avatar--${tech.status}`}>{tech.initials}</span>
          <span className={`sac-tech-status-dot sac-tech-status-dot--${tech.status}`} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="sac-tech-name">{tech.full_name}</div>
          <div className="sac-tech-id">
            {tech.employee_id || `@${tech.username}`}
          </div>
        </div>
        <TechnicianStatusIndicator status={tech.status} compact />
      </div>

      <div className="sac-tech-context-row">
        {tech.currentPanel ? (
          <>
            <span className="sac-tech-proj truncate">{tech.currentProject}</span>
            <span className="sac-tech-sep">·</span>
            <span className="sac-tech-panel truncate">{tech.currentPanel}</span>
          </>
        ) : (
          <span className="sac-tech-context--idle">Idle</span>
        )}
      </div>

      <div className="sac-tech-metrics">
        <div className="sac-tech-metric">
          <span className={`sac-tech-metric-val sac-load--${tech.workloadTone}`}>{tech.workloadPct}%</span>
          <span className="sac-tech-metric-lbl">Load</span>
        </div>
        <div className="sac-tech-metric">
          <span className="sac-tech-metric-val">{tech.etaLabel}</span>
          <span className="sac-tech-metric-lbl">ETA</span>
        </div>
        <div className="sac-tech-metric">
          <span className="sac-tech-metric-val">{tech.todayCompleted}</span>
          <span className="sac-tech-metric-lbl">Today</span>
        </div>
      </div>
      <div className="sac-tech-workload-bar" aria-hidden>
        <span
          className={`sac-tech-workload-fill sac-tech-workload-fill--${tech.workloadTone}`}
          style={{ width: `${Math.min(100, tech.workloadPct)}%` }}
        />
      </div>

      <div className="sac-tech-card-foot">
        {tech.parallelMode === 'parallel_ok' && (
          <span className="sac-parallel-badge sac-parallel-badge--ok">Parallel OK</span>
        )}
        {tech.parallelMode === 'handover_required' && (
          <span className="sac-parallel-badge sac-parallel-badge--warn">Mid-changeover only</span>
        )}
        {tech.skillTag === 'experienced' && (
          <span className="sac-skill-badge">Exp</span>
        )}
        {tech.readyForAssignment && (
          <span className="sac-ready-pill">Ready</span>
        )}
        {canQuickAssign && (
          <button
            type="button"
            className="sac-quick-assign"
            onClick={e => {
              e.stopPropagation();
              onQuickAssign();
            }}
          >
            Assign
          </button>
        )}
      </div>
    </article>
  );
}
