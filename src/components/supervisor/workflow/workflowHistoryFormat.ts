/**
 * Presentation helpers for Panel Workflow History.
 * Never mutates audit payloads — formats for display only.
 */
import { formatPersonLabel } from './workflowTypes';

export type HistoryFilterCategory =
  | 'all'
  | 'planning'
  | 'assignments'
  | 'progress'
  | 'delays'
  | 'approvals'
  | 'system';

export type HistoryTone = 'planning' | 'ok' | 'warn' | 'danger' | 'system';

export type HistoryRow = {
  id: number;
  workflow_id: number;
  stage_id?: number | null;
  project_code: string;
  frame_id: string;
  event_type: string;
  previous_value?: string | null;
  new_value?: string | null;
  user_id?: number | null;
  user_role?: string | null;
  reason?: string | null;
  created_at?: string | Date | null;
};

export type HistoryUserLookup = {
  id: number;
  name?: string | null;
  full_name?: string | null;
  username?: string | null;
};

export type HistoryDiffLine = { label: string; from: string; to: string };

export type DirectorUpgradeSummary = {
  template: string;
  added: string[];
  renamed: string[];
  durations: string[];
  legacy: string[];
  archived: string[];
};

const EVENT_LABELS: Record<string, string> = {
  stage_updated: 'Workflow Stage Updated',
  stage_added: 'Workflow Stage Added',
  stage_removed: 'Workflow Stage Removed',
  director_upgrade_applied: 'Director Planning Defaults Applied',
  workflow_created: 'Panel Workflow Created',
  workflow_updated: 'Panel Workflow Updated',
  workflow_archived: 'Panel Workflow Archived',
  template_applied: 'Workflow Template Applied',
  assignment_changed: 'Stage Assignment Updated',
  dependency_added: 'Dependency Added',
  dependency_removed: 'Dependency Removed',
  stage_started: 'Stage Started',
  stage_completed: 'Stage Completed',
  dependency_overridden: 'Dependency Override Approved',
  planning_defaults_updated: 'Planning Defaults Updated',
};

const ROLE_LABELS: Record<string, string> = {
  prod_supervisor: 'Production Supervisor',
  system_admin: 'System Administrator',
  ops_director: 'Operations Director',
  qaqc_engineer: 'QA/QC Engineer',
  technician: 'Technician',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Stage name',
  status: 'Status',
  enabled: 'Stage enabled',
  sequence: 'Sequence',
  remarks: 'Supervisor notes',
  instructions: 'Instructions',
  planned_duration_value: 'Planned duration',
  duration_unit: 'Duration unit',
  planned_duration_minutes: 'Planned duration (minutes)',
  progress_pct: 'Progress',
  priority: 'Priority',
  mandatory: 'Mandatory',
  confirmation_required: 'Confirmation required',
  supervisor_input_required: 'Supervisor input required',
  delay_minutes: 'Delay',
  delay_reason: 'Delay reason',
  approval_status: 'Approval status',
  user_id: 'Assigned technician',
  role_hint: 'Assignment role',
  panel_name: 'Panel name',
  notes: 'Notes',
  efficiency_factor: 'Efficiency factor',
  target_wires_per_hour: 'Target productivity',
};

const SKIP_DIFF_KEYS = new Set([
  'id',
  'workflow_id',
  'stage_id',
  'created_at',
  'updated_at',
  'assignees',
  'deps_as_stage',
  'preview',
  'archived_keys',
  'version',
]);

export function historyEventLabel(eventType: string | null | undefined): string {
  const key = String(eventType || '').trim();
  if (!key) return 'Workflow Event';
  if (EVENT_LABELS[key]) return EVENT_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function historyRoleLabel(role: string | null | undefined): string {
  const key = String(role || '').trim();
  if (!key) return 'System';
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function historyEventCategory(eventType: string | null | undefined): HistoryFilterCategory {
  const t = String(eventType || '');
  if (
    t.includes('assign')
    || t === 'assignment_changed'
  ) return 'assignments';
  if (
    t.includes('delay')
    || t.includes('blocked')
  ) return 'delays';
  if (
    t.includes('approv')
    || t.includes('override')
  ) return 'approvals';
  if (
    t.includes('started')
    || t.includes('completed')
    || t.includes('progress')
  ) return 'progress';
  if (
    t === 'director_upgrade_applied'
    || t === 'template_applied'
    || t === 'workflow_created'
    || t === 'workflow_archived'
    || t === 'dependency_added'
    || t === 'dependency_removed'
  ) return 'system';
  if (
    t.includes('stage')
    || t.includes('workflow_updated')
    || t.includes('planning')
    || t.includes('template')
  ) return 'planning';
  return 'system';
}

export function historyEventTone(eventType: string | null | undefined): HistoryTone {
  const t = String(eventType || '');
  if (t.includes('complet') || t.includes('approv')) return 'ok';
  if (t.includes('delay') || t.includes('override') || t.includes('warn')) return 'warn';
  if (t.includes('fail') || t.includes('reject') || t.includes('archiv') || t.includes('removed')) return 'danger';
  if (
    t === 'director_upgrade_applied'
    || t === 'template_applied'
    || t === 'workflow_created'
    || t.includes('dependency')
  ) return 'system';
  return 'planning';
}

export function formatHistoryDateUae(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function safeParseJson(raw: string | null | undefined): unknown {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function prettyJson(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '';
  const parsed = safeParseJson(raw);
  if (parsed == null) return String(raw);
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(raw);
  }
}

function formatDurationPair(value: unknown, unit: unknown): string {
  if (value == null || value === '') return 'Not set';
  const n = Number(value);
  const u = String(unit || '').toLowerCase();
  if (!Number.isFinite(n)) return String(value);
  if (u === 'days' || u === 'day') {
    return n === 1 ? '1 working day' : `${n} working days`;
  }
  if (u === 'hours' || u === 'hour' || u === 'h') {
    return n === 1 ? '1 hour' : `${n} hours`;
  }
  if (u === 'minutes' || u === 'minute' || u === 'min') {
    return n === 1 ? '1 minute' : `${n} minutes`;
  }
  return unit ? `${n} ${unit}` : String(n);
}

function titleCaseStatus(value: unknown): string {
  if (value == null || value === '') return 'Not set';
  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatHistoryValue(key: string, value: unknown, sibling?: Record<string, unknown>): string {
  if (value == null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'status' || key === 'approval_status') return titleCaseStatus(value);
  if (key === 'planned_duration_value') {
    return formatDurationPair(value, sibling?.duration_unit);
  }
  if (key === 'duration_unit') {
    const u = String(value).toLowerCase();
    if (u === 'days') return 'Working days';
    if (u === 'hours') return 'Hours';
    if (u === 'minutes') return 'Minutes';
    return titleCaseStatus(value);
  }
  if (key === 'progress_pct') return `${Number(value)}%`;
  if (key === 'target_wires_per_hour') return `${value} wires/hour`;
  if (key === 'delay_minutes') return `${value} min`;
  if (typeof value === 'object') return formatPersonLabel(value, 'Not set');
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

export function buildHistoryDiffs(
  previousRaw: string | null | undefined,
  newRaw: string | null | undefined,
): { lines: HistoryDiffLine[]; parseFailed: boolean } {
  const prevParsed = safeParseJson(previousRaw);
  const nextParsed = safeParseJson(newRaw);

  if (
    (previousRaw && prevParsed == null)
    || (newRaw && nextParsed == null)
  ) {
    return { lines: [], parseFailed: true };
  }

  const prev = asRecord(prevParsed) || {};
  const next = asRecord(nextParsed) || {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const lines: HistoryDiffLine[] = [];

  // Combine duration value+unit into one line when either changes
  const durationChanged = !valuesEqual(prev.planned_duration_value, next.planned_duration_value)
    || !valuesEqual(prev.duration_unit, next.duration_unit);
  if (durationChanged && ('planned_duration_value' in prev || 'planned_duration_value' in next
    || 'duration_unit' in prev || 'duration_unit' in next)) {
    lines.push({
      label: 'Planned duration',
      from: formatDurationPair(prev.planned_duration_value, prev.duration_unit),
      to: formatDurationPair(next.planned_duration_value, next.duration_unit),
    });
  }

  for (const key of keys) {
    if (SKIP_DIFF_KEYS.has(key)) continue;
    if (key === 'planned_duration_value' || key === 'duration_unit') continue;
    if (valuesEqual(prev[key], next[key])) continue;
    lines.push({
      label: FIELD_LABELS[key] || key.replace(/_/g, ' '),
      from: formatHistoryValue(key, prev[key], prev),
      to: formatHistoryValue(key, next[key], next),
    });
  }

  return { lines, parseFailed: false };
}

export function buildDirectorUpgradeSummary(
  newRaw: string | null | undefined,
): DirectorUpgradeSummary | null {
  const parsed = asRecord(safeParseJson(newRaw));
  if (!parsed) return null;
  const preview = asRecord(parsed.preview);
  if (!preview) return null;

  const label = typeof preview.label === 'string'
    ? preview.label
    : (typeof parsed.version === 'string' ? parsed.version : 'Director Planning Template v1');

  const added = Array.isArray(preview.adds)
    ? preview.adds.map((a: any) => String(a?.name || a?.stage_key || '').trim()).filter(Boolean)
    : [];

  const renamed = Array.isArray(preview.renames)
    ? preview.renames.map((r: any) => {
      const from = r?.from_name || r?.from_key || '';
      const to = r?.to_name || r?.to_key || '';
      return from && to ? `${from} → ${to}` : '';
    }).filter(Boolean)
    : [];

  const durations = Array.isArray(preview.duration_updates)
    ? preview.duration_updates.map((d: any) => {
      const name = d?.stage_key || 'Stage';
      const dur = formatDurationPair(d?.to_value, d?.to_unit);
      return `${name} → ${dur}`;
    }).filter(Boolean)
    : [];

  const legacy = Array.isArray(preview.legacy_retain)
    ? preview.legacy_retain.map((l: any) => String(l?.name || l?.stage_key || '').trim()).filter(Boolean)
    : [];

  const archivedKeys = Array.isArray(parsed.archived_keys)
    ? parsed.archived_keys.map((k: unknown) => String(k))
    : [];
  const archiveCandidates = Array.isArray(preview.unused_archive_candidates)
    ? preview.unused_archive_candidates
    : [];
  const archived = archivedKeys.map((key) => {
    const hit = archiveCandidates.find((c: any) => c?.stage_key === key);
    return hit?.name ? String(hit.name) : key;
  });

  return { template: label, added, renamed, durations, legacy, archived };
}

export function formatChangedBy(
  row: HistoryRow,
  users: HistoryUserLookup[] = [],
): string {
  const role = historyRoleLabel(row.user_role);
  const user = users.find((u) => u.id === row.user_id);
  if (user) {
    const person = formatPersonLabel(user, '');
    if (person) return `${role} (${person})`;
  }
  if (row.user_id != null) return `${role} (user #${row.user_id})`;
  return role;
}

export function resolveHistoryStageName(
  row: HistoryRow,
  stages: Array<{ id: number; name: string }> = [],
): string | null {
  if (row.stage_id != null) {
    const hit = stages.find((s) => s.id === row.stage_id);
    if (hit?.name) return hit.name;
  }
  const prev = asRecord(safeParseJson(row.previous_value));
  const next = asRecord(safeParseJson(row.new_value));
  const name = (next?.name || prev?.name) as string | undefined;
  return name ? String(name) : null;
}

export const HISTORY_FILTER_CHIPS: Array<{ id: HistoryFilterCategory; label: string }> = [
  { id: 'all', label: 'All Events' },
  { id: 'planning', label: 'Planning' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'progress', label: 'Progress' },
  { id: 'delays', label: 'Delays' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'system', label: 'System Changes' },
];
