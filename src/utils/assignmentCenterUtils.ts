/** Smart Assignment Center — shared types, status derivation, board, queue, recommendations. */

export type TechResourceStatus =
  | 'available'
  | 'assigned'
  | 'working'
  | 'busy';

export const TECH_STATUS_META: Record<
  TechResourceStatus,
  { label: string; chip: string; dot: string; sort: number }
> = {
  available: { label: '', chip: 'sac-status--available', dot: 'bg-emerald-500', sort: 0 },
  assigned: { label: 'Assigned', chip: 'sac-status--assigned', dot: 'bg-amber-500', sort: 1 },
  working: { label: 'Working', chip: 'sac-status--working', dot: 'bg-blue-500', sort: 2 },
  busy: { label: 'Busy', chip: 'sac-status--busy', dot: 'bg-red-500', sort: 3 },
};

export type AssignmentRow = {
  id: number;
  project_code: string;
  frame_id: string;
  panel_name?: string;
  technician_id: number;
  technician_name?: string;
  status?: string | null;
  kpi?: number;
  cables_total?: number | null;
  cables_src_done?: number | null;
  cables_dst_done?: number | null;
  started_at?: string | Date | null;
  completed_at?: string | Date | null;
  assigned_at?: string | Date | null;
  pause_reason?: string | null;
  report_submitted?: boolean | null;
  review_status?: string | null;
  changeover_locked?: boolean | null;
  handover_from_id?: number | null;
};

export type TechUser = {
  id: number;
  full_name?: string;
  username?: string;
  employee_id?: string;
  is_active?: boolean;
  ready_for_assignment?: boolean;
  last_login?: string | Date | null;
};

export type FrameMeta = {
  id: string;
  panel_name: string;
  project_code?: string;
  cable_count?: number | null;
  panel_type?: string | null;
  voltage_level?: string | null;
  system_type?: string | null;
};

export type ParallelMode = 'none' | 'parallel_ok' | 'handover_required';

export type TechResource = {
  id: number;
  full_name: string;
  username: string;
  employee_id: string;
  initials: string;
  status: TechResourceStatus;
  statusLabel: string;
  statusChip: string;
  currentProject: string | null;
  currentPanel: string | null;
  currentWirePct: number;
  workloadPct: number;
  workloadTone: 'idle' | 'normal' | 'overloaded';
  activeAssignments: number;
  todayCompleted: number;
  readyForAssignment: boolean;
  primaryAssignment: AssignmentRow | null;
  etaLabel: string;
  parallelMode: ParallelMode;
  skillTag: 'experienced' | 'general';
};

export type QueueItem = {
  id: string;
  projectCode: string;
  panelId: string;
  panelName: string;
  projectName: string;
  priority: number;
  addedAt: string;
  cableCount?: number;
  preferredTechId?: number | null;
  autoReady?: boolean;
};

export type Recommendation = {
  techId: number;
  techName: string;
  score: number;
  reasons: string[];
};

export type AuditEntry = {
  id: number;
  technician_id: number;
  technician_name?: string | null;
  project_code?: string | null;
  frame_id?: string | null;
  panel_name?: string | null;
  action: string;
  details?: string | null;
  created_at?: string | Date | null;
};

export type BoardCard = {
  key: string;
  lane: BoardLaneId;
  projectCode: string;
  panelId: string;
  panelName: string;
  projectName?: string;
  techName?: string | null;
  techId?: number | null;
  statusLabel: string;
  kpi?: number;
  cableCount?: number | null;
  voltage?: string | null;
  panelType?: string | null;
  priority?: number;
  autoReady?: boolean;
  isFocus?: boolean;
};

export type BoardLaneId =
  | 'current'
  | 'waiting'
  | 'in_progress'
  | 'completed_today'
  | 'available';

export type ShopFloorKpis = {
  availableTechs: number;
  working: number;
  waiting: number;
  unassignedPanels: number;
  completedToday: number;
};

export type TechFilterState = {
  query: string;
  status: TechResourceStatus | 'all';
  project: string; // '' | project_code
  voltage: string;
  panelType: string;
  skill: 'all' | 'experienced' | 'general';
};

const QUEUE_STORAGE_KEY = 'dwes-assignment-queue-v1';
const AUTO_NEXT_PREF_KEY = 'dwes-sac-auto-next-v1';
const WORKLOAD_CAP = 100;
const IDLE_LOAD_MAX = 15;
const OVERLOAD_LOAD_MIN = 75;
const CABLES_PER_HOUR = 12; // heuristic ETA rate

function isToday(d: string | Date | null | undefined): boolean {
  if (!d) return false;
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  return (
    dt.getFullYear() === now.getFullYear()
    && dt.getMonth() === now.getMonth()
    && dt.getDate() === now.getDate()
  );
}

export function calcKpi(a: AssignmentRow): number {
  if (a.kpi != null) return a.kpi;
  const total = a.cables_total || 0;
  if (total <= 0) return 0;
  const src = a.cables_src_done || 0;
  const dst = a.cables_dst_done || 0;
  return Math.round(((src + dst) / (total * 2)) * 100);
}

export function isActiveAssignment(a: AssignmentRow): boolean {
  const s = String(a.status || '');
  return s === 'assigned' || s === 'in_progress' || s === 'paused';
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

/** Heuristic remaining-time label from cable progress (not a server ETA). */
export function estimateEtaLabel(a: AssignmentRow | null): string {
  if (!a) return '—';
  const total = a.cables_total || 0;
  if (total <= 0) return '—';
  const src = a.cables_src_done || 0;
  const dst = a.cables_dst_done || 0;
  const remainingEnds = Math.max(0, total * 2 - src - dst);
  if (remainingEnds === 0) return 'Done';
  const hours = remainingEnds / 2 / CABLES_PER_HOUR;
  if (hours < 0.75) return `~${Math.max(15, Math.round(hours * 60))}m`;
  if (hours < 8) return `~${hours.toFixed(1)}h`;
  return `~${Math.round(hours)}h`;
}

export function workloadTone(pct: number, status: TechResourceStatus): 'idle' | 'normal' | 'overloaded' {
  if (status === 'available' || pct <= IDLE_LOAD_MAX) return 'idle';
  if (pct >= OVERLOAD_LOAD_MIN || status === 'busy') return 'overloaded';
  return 'normal';
}

export function deriveParallelMode(activeCount: number): ParallelMode {
  if (activeCount <= 0) return 'none';
  if (activeCount === 1) return 'parallel_ok';
  return 'handover_required';
}

export function deriveTechResourceStatus(
  tech: TechUser,
  assignments: AssignmentRow[],
): TechResourceStatus {
  if (tech.is_active === false) return 'busy';

  const mine = assignments.filter(a => a.technician_id === tech.id);

  const inProgress = mine.find(a => a.status === 'in_progress');
  if (inProgress) return 'working';

  const paused = mine.find(a => a.status === 'paused');
  if (paused) return 'busy';

  const assigned = mine.find(a => a.status === 'assigned');
  if (assigned) return 'assigned';

  const qaPending = mine.find(
    a => a.status === 'completed'
      && a.report_submitted
      && (!a.review_status || a.review_status === 'pending'),
  );
  if (qaPending) return 'busy';

  return 'available';
}

export function buildTechResources(
  techs: TechUser[],
  allAssignments: AssignmentRow[],
  focusProjectCode?: string,
): TechResource[] {
  const projectExperienced = new Set(
    focusProjectCode
      ? allAssignments
        .filter(a => a.project_code === focusProjectCode && a.status === 'completed')
        .map(a => a.technician_id)
      : [],
  );

  return techs
    .filter(t => t.is_active !== false)
    .map(tech => {
      const mine = allAssignments.filter(a => a.technician_id === tech.id);
      const active = mine.filter(isActiveAssignment);
      const status = deriveTechResourceStatus(tech, allAssignments);
      const meta = TECH_STATUS_META[status];

      const primary =
        active.find(a => a.status === 'in_progress')
        ?? active.find(a => a.status === 'paused')
        ?? active.find(a => a.status === 'assigned')
        ?? null;

      const workloadPct = active.length === 0
        ? 0
        : Math.min(
          WORKLOAD_CAP,
          Math.round(
            active.reduce((sum, a) => sum + calcKpi(a), 0) / Math.max(active.length, 1),
          ),
        );

      const todayCompleted = mine.filter(
        a => a.status === 'completed' && isToday(a.completed_at),
      ).length;

      const fullName = tech.full_name || `Tech #${tech.id}`;

      return {
        id: tech.id,
        full_name: fullName,
        username: tech.username || '',
        employee_id: tech.employee_id || '',
        initials: initialsFromName(fullName),
        status,
        statusLabel: meta.label,
        statusChip: meta.chip,
        currentProject: primary?.project_code ?? null,
        currentPanel: primary?.panel_name ?? primary?.frame_id ?? null,
        currentWirePct: primary ? calcKpi(primary) : 0,
        workloadPct,
        workloadTone: workloadTone(workloadPct, status),
        activeAssignments: active.length,
        todayCompleted,
        readyForAssignment: Boolean(tech.ready_for_assignment),
        primaryAssignment: primary,
        etaLabel: estimateEtaLabel(primary),
        parallelMode: deriveParallelMode(active.length),
        skillTag: (projectExperienced.has(tech.id) ? 'experienced' : 'general') as TechResource['skillTag'],
      };
    })
    .sort((a, b) => {
      const sa = TECH_STATUS_META[a.status].sort;
      const sb = TECH_STATUS_META[b.status].sort;
      if (sa !== sb) return sa - sb;
      return a.full_name.localeCompare(b.full_name);
    }) as TechResource[];
}

export function techHasConflictingPanel(
  techId: number,
  projectCode: string,
  panelId: string,
  allAssignments: AssignmentRow[],
): AssignmentRow | null {
  const conflict = allAssignments.find(
    a => a.technician_id === techId
      && isActiveAssignment(a)
      && !(a.project_code === projectCode && a.frame_id === panelId),
  );
  return conflict ?? null;
}

export function loadAssignmentQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAssignmentQueue(items: QueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}

export function loadAutoNextEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_NEXT_PREF_KEY);
    if (raw == null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export function saveAutoNextEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_NEXT_PREF_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function buildRecommendations(
  techResources: TechResource[],
  projectCode: string,
  allAssignments: AssignmentRow[],
  limit = 3,
): Recommendation[] {
  const projectHistory = new Set(
    allAssignments
      .filter(a => a.project_code === projectCode && a.status === 'completed')
      .map(a => a.technician_id),
  );

  return techResources
    .map(tech => {
      let score = 0;
      const reasons: string[] = [];

      if (tech.status === 'available') {
        score += 35;
        reasons.push('Free now');
      } else if (tech.status === 'assigned') {
        score += 15;
        reasons.push('Assigned but not started');
      } else if (tech.status === 'working') {
        score += 10;
        reasons.push('Currently wiring — check workload');
      } else {
        score -= 20;
        reasons.push('Busy or unavailable');
      }

      if (tech.readyForAssignment) {
        score += 25;
        reasons.push('Marked ready for assignment');
      }

      score -= Math.round(tech.workloadPct * 0.25);
      if (tech.workloadPct <= 30) reasons.push('Low workload');
      if (tech.workloadTone === 'overloaded') {
        score -= 25;
        reasons.push('Overloaded');
      }

      if (projectHistory.has(tech.id)) {
        score += 18;
        reasons.push('Prior experience on this project');
      }

      if (tech.activeAssignments === 0) {
        score += 12;
        reasons.push('No active panels');
      } else if (tech.activeAssignments === 1 && tech.parallelMode === 'parallel_ok') {
        score += 4;
        reasons.push('Parallel OK (1 active)');
      } else if (tech.activeAssignments >= 2) {
        score -= 15;
        reasons.push('Mid-changeover required');
      }

      return {
        techId: tech.id,
        techName: tech.full_name,
        score: Math.max(0, Math.min(100, score)),
        reasons: reasons.slice(0, 3),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Best heuristic pick for one-click Assign Best Technician. */
export function pickBestTechnician(
  techResources: TechResource[],
  projectCode: string,
  allAssignments: AssignmentRow[],
): Recommendation | null {
  const [best] = buildRecommendations(techResources, projectCode, allAssignments, 1);
  return best ?? null;
}

export function formatAuditAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function filterTechResources(
  resources: TechResource[],
  filters: TechFilterState,
): TechResource[] {
  const q = filters.query.trim().toLowerCase();
  return resources.filter(r => {
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.skill !== 'all' && r.skillTag !== filters.skill) return false;
    if (filters.project && r.currentProject !== filters.project) return false;
    if (filters.voltage) {
      const v = String(r.primaryAssignment?.project_code || '').toLowerCase();
      // Voltage often encoded in project code prefix; also match empty when filtering idle
      if (r.status === 'available' && !r.primaryAssignment) {
        /* idle techs pass voltage filter only when no voltage selected — already handled */
      } else if (filters.voltage && !v.includes(filters.voltage.toLowerCase())) {
        // Fall through — voltage filter applied on board cards; for techs use project code prefix
        const code = (r.currentProject || '').toLowerCase();
        if (!code.startsWith(filters.voltage.toLowerCase()) && !code.includes(`_${filters.voltage.toLowerCase()}`)) {
          // Keep tech visible if they have no project (available) when voltage filter set
          if (r.currentProject) return false;
        }
      }
    }
    if (filters.panelType) {
      // Panel type is on frames; tech filter uses current panel name heuristic only
      const panel = (r.currentPanel || '').toLowerCase();
      if (r.currentPanel && !panel.includes(filters.panelType.toLowerCase())) return false;
    }
    if (!q) return true;
    return (
      r.full_name.toLowerCase().includes(q)
      || r.username.toLowerCase().includes(q)
      || r.employee_id.toLowerCase().includes(q)
      || (r.currentPanel || '').toLowerCase().includes(q)
      || (r.currentProject || '').toLowerCase().includes(q)
    );
  });
}

export function buildShopFloorKpis(
  techResources: TechResource[],
  queue: QueueItem[],
  allAssignments: AssignmentRow[],
  availablePanelCount: number,
): ShopFloorKpis {
  return {
    availableTechs: techResources.filter(t => t.status === 'available').length,
    working: new Set(
      allAssignments.filter(a => a.status === 'in_progress').map(a => a.technician_id),
    ).size,
    waiting: queue.length,
    unassignedPanels: availablePanelCount,
    completedToday: allAssignments.filter(
      a => a.status === 'completed' && isToday(a.completed_at),
    ).length,
  };
}

function frameKey(projectCode: string, panelId: string): string {
  return `${projectCode}::${panelId}`;
}

export function buildAssignmentBoard(opts: {
  focusProjectCode: string;
  focusPanelId: string;
  focusPanelName: string;
  focusProjectName: string;
  focusAssignment: AssignmentRow | null;
  focusCableCount: number;
  focusVoltage?: string | null;
  focusPanelType?: string | null;
  allAssignments: AssignmentRow[];
  projectFrames: FrameMeta[];
  queue: QueueItem[];
  filters: TechFilterState;
}): Record<BoardLaneId, BoardCard[]> {
  const {
    focusProjectCode,
    focusPanelId,
    focusPanelName,
    focusProjectName,
    focusAssignment,
    focusCableCount,
    focusVoltage,
    focusPanelType,
    allAssignments,
    projectFrames,
    queue,
    filters,
  } = opts;

  const activeKeys = new Set(
    allAssignments.filter(isActiveAssignment).map(a => frameKey(a.project_code, a.frame_id)),
  );

  const matchesMeta = (card: Pick<BoardCard, 'projectCode' | 'panelName' | 'voltage' | 'panelType'>) => {
    if (filters.project && card.projectCode !== filters.project) return false;
    if (filters.voltage) {
      const v = (card.voltage || '').toLowerCase();
      const code = card.projectCode.toLowerCase();
      if (!v.includes(filters.voltage.toLowerCase()) && !code.startsWith(filters.voltage.toLowerCase())) {
        return false;
      }
    }
    if (filters.panelType) {
      const t = (card.panelType || card.panelName || '').toLowerCase();
      if (!t.includes(filters.panelType.toLowerCase())) return false;
    }
    if (filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      const hay = `${card.panelName} ${card.projectCode}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const current: BoardCard[] = [];
  if (focusAssignment && isActiveAssignment(focusAssignment)) {
    const card: BoardCard = {
      key: `current-${focusAssignment.id}`,
      lane: 'current',
      projectCode: focusProjectCode,
      panelId: focusPanelId,
      panelName: focusPanelName,
      projectName: focusProjectName,
      techName: focusAssignment.technician_name,
      techId: focusAssignment.technician_id,
      statusLabel: String(focusAssignment.status || 'assigned'),
      kpi: calcKpi(focusAssignment),
      cableCount: focusCableCount || focusAssignment.cables_total,
      voltage: focusVoltage,
      panelType: focusPanelType,
      isFocus: true,
    };
    if (matchesMeta(card)) current.push(card);
  } else {
    const card: BoardCard = {
      key: `focus-${focusPanelId}`,
      lane: 'current',
      projectCode: focusProjectCode,
      panelId: focusPanelId,
      panelName: focusPanelName,
      projectName: focusProjectName,
      techName: null,
      statusLabel: 'unassigned',
      cableCount: focusCableCount,
      voltage: focusVoltage,
      panelType: focusPanelType,
      isFocus: true,
    };
    if (matchesMeta(card)) current.push(card);
  }

  const waiting: BoardCard[] = queue
    .map(q => ({
      key: `queue-${q.id}`,
      lane: 'waiting' as const,
      projectCode: q.projectCode,
      panelId: q.panelId,
      panelName: q.panelName,
      projectName: q.projectName,
      statusLabel: q.autoReady ? 'auto-ready' : 'queued',
      cableCount: q.cableCount,
      priority: q.priority,
      autoReady: q.autoReady,
      techId: q.preferredTechId ?? null,
    }))
    .filter(matchesMeta);

  const inProgress: BoardCard[] = allAssignments
    .filter(a => a.status === 'in_progress' || a.status === 'paused')
    .map(a => {
      const frame = projectFrames.find(f => f.id === a.frame_id && (f.project_code || focusProjectCode) === a.project_code);
      return {
        key: `ip-${a.id}`,
        lane: 'in_progress' as const,
        projectCode: a.project_code,
        panelId: a.frame_id,
        panelName: a.panel_name || a.frame_id,
        techName: a.technician_name,
        techId: a.technician_id,
        statusLabel: String(a.status),
        kpi: calcKpi(a),
        cableCount: a.cables_total,
        voltage: frame?.voltage_level ?? null,
        panelType: frame?.panel_type ?? null,
        isFocus: a.project_code === focusProjectCode && a.frame_id === focusPanelId,
      };
    })
    .filter(matchesMeta);

  const completedToday: BoardCard[] = allAssignments
    .filter(a => a.status === 'completed' && isToday(a.completed_at))
    .slice(0, 24)
    .map(a => ({
      key: `done-${a.id}`,
      lane: 'completed_today' as const,
      projectCode: a.project_code,
      panelId: a.frame_id,
      panelName: a.panel_name || a.frame_id,
      techName: a.technician_name,
      techId: a.technician_id,
      statusLabel: 'completed',
      kpi: calcKpi(a),
      cableCount: a.cables_total,
      isFocus: a.project_code === focusProjectCode && a.frame_id === focusPanelId,
    }))
    .filter(matchesMeta);

  const queuedKeys = new Set(queue.map(q => frameKey(q.projectCode, q.panelId)));
  const available: BoardCard[] = projectFrames
    .filter(f => {
      const pc = f.project_code || focusProjectCode;
      const key = frameKey(pc, f.id);
      if (activeKeys.has(key)) return false;
      if (queuedKeys.has(key)) return false;
      if (pc === focusProjectCode && f.id === focusPanelId && focusAssignment && isActiveAssignment(focusAssignment)) {
        return false;
      }
      return true;
    })
    .map(f => ({
      key: `avail-${f.id}`,
      lane: 'available' as const,
      projectCode: f.project_code || focusProjectCode,
      panelId: f.id,
      panelName: f.panel_name,
      statusLabel: (f.cable_count || 0) > 0 ? 'ready' : 'no schedule',
      cableCount: f.cable_count,
      voltage: f.voltage_level,
      panelType: f.panel_type,
      isFocus: f.id === focusPanelId,
    }))
    .filter(matchesMeta);

  return { current, waiting, in_progress: inProgress, completed_today: completedToday, available };
}

/**
 * Find next queued panel for a technician after completion.
 * Prefers preferredTechId match, else first queue item for any tech.
 */
export function findNextQueueForTech(
  queue: QueueItem[],
  techId: number,
): QueueItem | null {
  const preferred = queue
    .filter(q => q.preferredTechId === techId)
    .sort((a, b) => a.priority - b.priority);
  if (preferred[0]) return preferred[0];
  const general = [...queue].sort((a, b) => a.priority - b.priority);
  return general[0] ?? null;
}

/** Detect techs whose active work just completed (for auto-next). */
export function detectNewlyCompletedTechs(
  prev: AssignmentRow[],
  next: AssignmentRow[],
): Array<{ techId: number; projectCode: string; frameId: string }> {
  const prevActive = new Map(
    prev.filter(isActiveAssignment).map(a => [`${a.technician_id}:${a.project_code}:${a.frame_id}`, a]),
  );
  const results: Array<{ techId: number; projectCode: string; frameId: string }> = [];
  for (const a of next) {
    if (a.status !== 'completed') continue;
    const key = `${a.technician_id}:${a.project_code}:${a.frame_id}`;
    if (prevActive.has(key) && isToday(a.completed_at)) {
      results.push({
        techId: a.technician_id,
        projectCode: a.project_code,
        frameId: a.frame_id,
      });
    }
  }
  return results;
}

export function uniqueFilterOptions(
  frames: FrameMeta[],
  assignments: AssignmentRow[],
): { projects: string[]; voltages: string[]; panelTypes: string[] } {
  const projects = new Set<string>();
  const voltages = new Set<string>();
  const panelTypes = new Set<string>();
  for (const f of frames) {
    if (f.project_code) projects.add(f.project_code);
    if (f.voltage_level) voltages.add(f.voltage_level);
    if (f.panel_type) panelTypes.add(f.panel_type);
  }
  for (const a of assignments) {
    if (a.project_code) projects.add(a.project_code);
  }
  return {
    projects: [...projects].sort(),
    voltages: [...voltages].sort(),
    panelTypes: [...panelTypes].sort(),
  };
}
