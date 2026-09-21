/** Shared types for Panel Workflow W2/WA1 workspace. */

export type WorkflowTabId =
  | 'plan'
  | 'assignments'
  | 'time'
  | 'dependencies'
  | 'progress'
  | 'delays'
  | 'history';

export type DurationUnit = 'minutes' | 'hours' | 'days';

export interface WorkflowStageRow {
  id: number;
  workflow_id: number;
  stage_key: string;
  name: string;
  sequence: number;
  enabled: boolean;
  mandatory: boolean;
  requires_approval: boolean;
  approval_role: string | null;
  priority: string | null;
  status: string;
  planned_duration_minutes: number | null;
  planned_duration_value?: number | string | null;
  duration_unit?: DurationUnit | string | null;
  confirmation_required?: boolean;
  supervisor_input_required?: boolean;
  is_legacy?: boolean;
  terminology_unconfirmed?: boolean;
  planned_start_at: string | null;
  planned_finish_at: string | null;
  actual_start_at: string | null;
  actual_finish_at: string | null;
  progress_pct: number;
  instructions: string | null;
  remarks: string | null;
  delay_minutes: number | null;
  delay_reason: string | null;
  approval_status: string | null;
  assignees?: Array<{ id: number; user_id: number; role_hint: string | null }>;
  deps_as_stage?: Array<{ id: number; prerequisite_stage_id: number }>;
}

export interface WorkflowDepRow {
  id: number;
  workflow_id: number;
  stage_id: number;
  prerequisite_stage_id: number;
}

export interface PanelWiringAssignmentProjection {
  assignment_id: number;
  technician_id: number;
  technician_name?: string | null;
  status?: string | null;
  started_at?: string | Date | null;
  assigned_at?: string | Date | null;
  lifecycle?: string;
  can_reassign?: boolean;
  can_mid_change?: boolean;
  synced_with_wiring_stage?: boolean;
}

export interface PanelWorkflowRow {
  id: number;
  project_code: string;
  frame_id: string;
  panel_name: string | null;
  template_id: number | null;
  planning_template_version?: string | null;
  status: string;
  planned_completion_at: string | null;
  forecast_completion_at: string | null;
  target_completion_at: string | null;
  efficiency_factor: number | string | null;
  notes: string | null;
  stages: WorkflowStageRow[];
  stage_deps: WorkflowDepRow[];
  ensured?: boolean;
  /** Joined projection from ensure/get — preferred for Assignments tab labels. */
  panel_wiring_assignment?: PanelWiringAssignmentProjection | null;
}

export interface ProductivityDefaults {
  configurable_planning_values: boolean;
  regular_hours_per_day: number;
  productive_hours_per_shift: number;
  target_wires_per_day: number;
  target_wires_per_hour: number;
  director_wiring_planned_hours?: number;
  standard_minutes_per_wire: number | null;
  wire_delay_warning_minutes: number;
  break_duration_minutes: number | null;
  lunch_duration_minutes: number | null;
  allowed_overtime_minutes: number | null;
  source?: string;
  project_code?: string | null;
}

export interface WiringEstimate {
  total_wires: number;
  target_wires_per_hour: number;
  director_wiring_planned_hours?: number;
  efficiency_factor: number;
  planned_technicians: number;
  productive_hours_per_day: number;
  estimated_hours: number;
  estimated_working_days: number;
  difference_hours?: number;
  exceeds_planned?: boolean;
  planning_note?: string;
  formula?: string;
}

export function formatTs(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

export function formatDurationMinutes(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(Number(mins))) return '—';
  const m = Number(mins);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Safe React-child label for person/technician values.
 * Never returns an object — prevents React error #31.
 */
export function formatPersonLabel(value: unknown, emptyLabel = 'Unassigned'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || emptyLabel;
  }
  if (!value || typeof value !== 'object') return emptyLabel;

  const person = value as {
    name?: unknown;
    full_name?: unknown;
    displayName?: unknown;
    display_name?: unknown;
    username?: unknown;
    employee_id?: unknown;
  };

  const name =
    (typeof person.displayName === 'string' && person.displayName.trim())
    || (typeof person.display_name === 'string' && person.display_name.trim())
    || (typeof person.full_name === 'string' && person.full_name.trim())
    || (typeof person.name === 'string' && person.name.trim())
    || '';

  const username = typeof person.username === 'string'
    ? person.username.trim().replace(/^@/, '')
    : '';

  const employeeId = typeof person.employee_id === 'string'
    ? person.employee_id.trim()
    : (typeof person.employee_id === 'number' ? String(person.employee_id) : '');

  if (name && username) return `${name} (@${username})`;
  if (name) return name;
  if (username) return `@${username}`;
  if (employeeId) return employeeId;
  return emptyLabel;
}

/** Comma-separated person labels for assignee arrays. */
export function formatPersonList(
  values: unknown[] | null | undefined,
  emptyLabel = 'Unassigned',
): string {
  if (!Array.isArray(values) || values.length === 0) return emptyLabel;
  const labels = values
    .map(v => formatPersonLabel(v, ''))
    .filter(Boolean);
  return labels.length ? labels.join(', ') : emptyLabel;
}

/** Display Supervisor-entered value + unit, with equivalent hours when known. */
export function formatPlannedDuration(
  stage: Pick<WorkflowStageRow, 'planned_duration_value' | 'duration_unit' | 'planned_duration_minutes' | 'confirmation_required' | 'supervisor_input_required'>,
): string {
  if (stage.confirmation_required && (stage.planned_duration_value == null || stage.planned_duration_value === '')) {
    return 'Confirmation required';
  }
  if (stage.supervisor_input_required && (stage.planned_duration_value == null || stage.planned_duration_value === '')) {
    return 'Supervisor input required';
  }
  const value = stage.planned_duration_value != null && stage.planned_duration_value !== ''
    ? Number(stage.planned_duration_value)
    : null;
  const unit = String(stage.duration_unit || '').toLowerCase();
  if (value != null && !Number.isNaN(value) && unit) {
    const unitLabel = unit === 'days' ? (value === 1 ? 'day' : 'days')
      : unit === 'hours' ? (value === 1 ? 'hour' : 'hours')
        : 'min';
    const equiv = stage.planned_duration_minutes != null
      ? ` (${formatDurationMinutes(stage.planned_duration_minutes)})`
      : '';
    return `${value} ${unitLabel}${equiv}`;
  }
  return formatDurationMinutes(stage.planned_duration_minutes);
}

const WIRE_TIME_GUIDANCE = 'Warning after 12 productive minutes · Critical after 15 productive minutes · Lunch and approved breaks excluded. Reference only — alerts not activated in this view.';

export function wireTimeGuidanceText(): string {
  return WIRE_TIME_GUIDANCE;
}

/** Compact badge text for stage list rows. */
export function stageBadgeLabelShort(stage: WorkflowStageRow, isCurrent: boolean): string {
  if (stage.is_legacy) return 'Legacy';
  if (stage.supervisor_input_required && (stage.planned_duration_value == null || stage.planned_duration_value === '')) {
    return 'Input Required';
  }
  if (stage.confirmation_required && (stage.planned_duration_value == null || stage.planned_duration_value === '')) {
    return 'Confirmation Required';
  }
  const st = String(stage.status || '').toUpperCase();
  if (st === 'COMPLETED' || st === 'APPROVED') return 'Completed';
  if (st === 'BLOCKED') return 'Blocked';
  if (st === 'DELAYED' || (stage.delay_minutes != null && stage.delay_minutes > 0)) return 'Delayed';
  if (isCurrent || st === 'IN_PROGRESS' || st === 'READY') return 'Current';
  return 'Pending';
}

/** One-line subtitle under stage name in the list. */
export function stageListSubtitle(
  stage: WorkflowStageRow,
  wiringEstimate?: Pick<WiringEstimate, 'target_wires_per_hour'> | null,
): string {
  if (stage.stage_key === 'WIRING') {
    const value = stage.planned_duration_value != null && stage.planned_duration_value !== ''
      ? Number(stage.planned_duration_value)
      : null;
    const unit = String(stage.duration_unit || 'hours').toLowerCase();
    const wiresPerHour = wiringEstimate?.target_wires_per_hour ?? 22;
    if (value != null && !Number.isNaN(value) && unit === 'hours') {
      return `${value} ${value === 1 ? 'hour' : 'hours'} · ${wiresPerHour} wires/hour`;
    }
  }
  const base = formatPlannedDuration(stage);
  if (stage.confirmation_required && (stage.planned_duration_value == null || stage.planned_duration_value === '')) {
    return 'Supervisor confirmation required';
  }
  if (stage.supervisor_input_required && (stage.planned_duration_value == null || stage.planned_duration_value === '')) {
    return 'Duration requires Supervisor input';
  }
  return base;
}

export function stageStatusTone(status: string): string {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'APPROVED') return 'done';
  if (s === 'IN_PROGRESS' || s === 'READY') return 'progress';
  if (s === 'DELAYED' || s === 'BLOCKED' || s === 'REWORK_REQUIRED') return 'warn';
  if (s === 'PAUSED' || s === 'APPROVAL_PENDING') return 'paused';
  return 'idle';
}

export function actualDurationMinutes(stage: WorkflowStageRow): number | null {
  if (!stage.actual_start_at || !stage.actual_finish_at) return null;
  const a = new Date(stage.actual_start_at).getTime();
  const b = new Date(stage.actual_finish_at).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}
