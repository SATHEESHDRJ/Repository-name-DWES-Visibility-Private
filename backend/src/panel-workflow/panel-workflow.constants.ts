/** Configurable planning defaults (code-level; not immutable business rules). */
export const PLANNING_DEFAULTS = Object.freeze({
  configurable_planning_values: true as const,
  regular_hours_per_day: 10,
  productive_hours_per_shift: 10,
  target_wires_per_day: 220,
  target_wires_per_hour: 22,
  /** Director planned Wiring duration (hours) — separate from calculated estimate. */
  director_wiring_planned_hours: 11,
  standard_minutes_per_wire: null as number | null,
  wire_delay_warning_minutes: 15,
  break_duration_minutes: null as number | null,
  lunch_duration_minutes: null as number | null,
  allowed_overtime_minutes: null as number | null,
});

export type DurationUnit = 'minutes' | 'hours' | 'days';

export type DefaultStageDef = {
  stage_key: string;
  name: string;
  sequence: number;
  mandatory: boolean;
  enabled: boolean;
  requires_approval: boolean;
  approval_role: string | null;
  /** Prerequisite stage_key in the same default set (optional). */
  depends_on: string | null;
  default_duration_value: number | null;
  duration_unit: DurationUnit | null;
  confirmation_required: boolean;
  supervisor_input_required: boolean;
  /** HV Shorting (and similar) — show terminology badge until confirmed. */
  terminology_unconfirmed?: boolean;
};

/** Display label for Director Planning Template v1 (code DIRECTOR_WA1_V1). */
export const DIRECTOR_PLANNING_TEMPLATE_LABEL = 'Director Planning Template v1';

/**
 * Legacy W1 keys that map onto Director keys (rename in place when safe).
 * Keys not listed here are either already Director keys or retained as legacy.
 */
export const LEGACY_TO_DIRECTOR_KEY: Readonly<Record<string, string>> = Object.freeze({
  AC_DC_TESTING: 'QAQC_PENDING_PUNCH',
  FAT_CLEARANCE: 'FAT_PUNCH_CLEARANCE',
  PACKING_READINESS: 'PACKING_PUNCH_CLEARANCE',
});

/** Known non-Director keys that may be retained with is_legacy when in use. */
export const KNOWN_LEGACY_STAGE_KEYS = Object.freeze([
  'HV_TESTING',
  'HV_REWORK',
  'DISPATCH',
  'AC_DC_TESTING',
  'FAT_CLEARANCE',
  'PACKING_READINESS',
] as const);

/**
 * Convert Supervisor-entered duration to canonical minutes.
 * Days use configured productive hours/day — never silently force 10.
 */
export function durationToMinutes(
  value: number | null | undefined,
  unit: string | null | undefined,
  productiveHoursPerDay: number | null | undefined,
): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  if (v < 0) return null;
  const u = String(unit || 'minutes').toLowerCase();
  if (u === 'minutes' || u === 'minute' || u === 'min') return Math.round(v);
  if (u === 'hours' || u === 'hour' || u === 'h') return Math.round(v * 60);
  if (u === 'days' || u === 'day' || u === 'd') {
    const hours =
      productiveHoursPerDay != null && Number(productiveHoursPerDay) > 0
        ? Number(productiveHoursPerDay)
        : PLANNING_DEFAULTS.productive_hours_per_shift;
    return Math.round(v * hours * 60);
  }
  return Math.round(v);
}

export function minutesToDisplayHours(minutes: number | null | undefined): number | null {
  if (minutes == null || Number.isNaN(Number(minutes))) return null;
  return Math.round((Number(minutes) / 60) * 100) / 100;
}

/** System template code for explicit Supervisor apply (never silent overwrite). */
export const DIRECTOR_WA1_TEMPLATE_CODE = 'DIRECTOR_WA1_V1';

/**
 * Director WA1 planning catalog.
 * Unconfirmed terminology (HV Reconnection, HV Shorting label, punch/cutout durations)
 * remains editable — not permanent business rules.
 */
export const DEFAULT_PANEL_STAGES: readonly DefaultStageDef[] = Object.freeze([
  {
    stage_key: 'PANEL_ASSEMBLY',
    name: 'Panel Assembly',
    sequence: 1,
    mandatory: true,
    enabled: true,
    requires_approval: false,
    approval_role: null,
    depends_on: null,
    default_duration_value: 2,
    duration_unit: 'days',
    confirmation_required: false,
    supervisor_input_required: false,
  },
  {
    stage_key: 'WIRING',
    name: 'Wiring',
    sequence: 2,
    mandatory: true,
    enabled: true,
    requires_approval: false,
    approval_role: null,
    depends_on: 'PANEL_ASSEMBLY',
    default_duration_value: 11,
    duration_unit: 'hours',
    confirmation_required: false,
    supervisor_input_required: false,
  },
  {
    stage_key: 'QAQC_PENDING_PUNCH',
    name: 'QA/QC Pending Punch Points',
    sequence: 3,
    mandatory: true,
    enabled: true,
    requires_approval: false,
    approval_role: null,
    depends_on: 'WIRING',
    default_duration_value: 0.5,
    duration_unit: 'days',
    confirmation_required: false,
    supervisor_input_required: false,
  },
  {
    stage_key: 'HS_SHORTING',
    name: 'HV Shorting',
    sequence: 4,
    mandatory: true,
    enabled: true,
    requires_approval: false,
    approval_role: null,
    depends_on: 'QAQC_PENDING_PUNCH',
    default_duration_value: 0.5,
    duration_unit: 'days',
    confirmation_required: false,
    supervisor_input_required: false,
    terminology_unconfirmed: true,
  },
  {
    stage_key: 'HV_RECONNECTION',
    name: 'HV Reconnection',
    sequence: 5,
    mandatory: false,
    enabled: false,
    requires_approval: false,
    approval_role: null,
    depends_on: 'HS_SHORTING',
    default_duration_value: null,
    duration_unit: null,
    confirmation_required: true,
    supervisor_input_required: false,
  },
  {
    stage_key: 'FAT_PUNCH_CLEARANCE',
    name: 'FAT Punch Clearance',
    sequence: 6,
    mandatory: true,
    enabled: true,
    requires_approval: true,
    approval_role: 'qaqc_engineer',
    depends_on: 'HS_SHORTING',
    default_duration_value: 3,
    duration_unit: 'hours',
    confirmation_required: false,
    supervisor_input_required: false,
  },
  {
    stage_key: 'PACKING_PUNCH_CLEARANCE',
    name: 'Packing Punch Clearance',
    sequence: 7,
    mandatory: true,
    enabled: true,
    requires_approval: false,
    approval_role: null,
    depends_on: 'FAT_PUNCH_CLEARANCE',
    default_duration_value: null,
    duration_unit: null,
    confirmation_required: false,
    supervisor_input_required: true,
  },
  {
    stage_key: 'CUTOUT',
    name: 'Cutout',
    sequence: 8,
    mandatory: false,
    enabled: false,
    requires_approval: false,
    approval_role: null,
    depends_on: 'PACKING_PUNCH_CLEARANCE',
    default_duration_value: null,
    duration_unit: null,
    confirmation_required: false,
    supervisor_input_required: true,
  },
  {
    stage_key: 'PACKING',
    name: 'Packing',
    sequence: 9,
    mandatory: true,
    enabled: true,
    requires_approval: false,
    approval_role: null,
    depends_on: 'PACKING_PUNCH_CLEARANCE',
    default_duration_value: 1,
    duration_unit: 'hours',
    confirmation_required: false,
    supervisor_input_required: false,
  },
  {
    stage_key: 'MISCELLANEOUS',
    name: 'Miscellaneous',
    sequence: 10,
    mandatory: false,
    enabled: false,
    requires_approval: false,
    approval_role: null,
    depends_on: 'PACKING',
    default_duration_value: null,
    duration_unit: null,
    confirmation_required: false,
    supervisor_input_required: true,
  },
  {
    stage_key: 'PANEL_COMPLETION',
    name: 'Panel Completion',
    sequence: 11,
    mandatory: true,
    enabled: true,
    requires_approval: true,
    approval_role: 'prod_supervisor',
    depends_on: 'PACKING',
    default_duration_value: null,
    duration_unit: null,
    confirmation_required: false,
    supervisor_input_required: false,
  },
]);

export const WORKFLOW_INCLUDE = {
  stages: {
    orderBy: { sequence: 'asc' as const },
    include: {
      assignees: true,
      deps_as_stage: true,
    },
  },
  stage_deps: true,
} as const;
