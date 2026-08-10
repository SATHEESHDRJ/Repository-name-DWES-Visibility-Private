/**
 * Pure helpers for Director Planning Template v1 safe upgrade preview/apply.
 * Keep side-effect-free so unit tests can cover mapping without Prisma.
 */
import {
  DEFAULT_PANEL_STAGES,
  DIRECTOR_WA1_TEMPLATE_CODE,
  DIRECTOR_PLANNING_TEMPLATE_LABEL,
  LEGACY_TO_DIRECTOR_KEY,
  durationToMinutes,
  type DefaultStageDef,
} from './panel-workflow.constants';

export type StageLike = {
  id: number;
  stage_key: string;
  name: string;
  sequence: number;
  enabled?: boolean;
  status?: string | null;
  progress_pct?: number | null;
  actual_start_at?: Date | string | null;
  actual_finish_at?: Date | string | null;
  planned_duration_value?: unknown;
  duration_unit?: string | null;
  planned_duration_minutes?: number | null;
  assignees?: Array<unknown> | null;
  is_legacy?: boolean;
  terminology_unconfirmed?: boolean;
};

export type DepLike = {
  stage_id: number;
  prerequisite_stage_id: number;
};

export type RenamePreview = {
  stage_id: number;
  from_key: string;
  to_key: string;
  from_name: string;
  to_name: string;
};

export type DurationUpdatePreview = {
  stage_id: number;
  stage_key: string;
  from_value: number | null;
  from_unit: string | null;
  to_value: number | null;
  to_unit: string | null;
  safe: boolean;
  warn: string | null;
};

export type AddPreview = {
  stage_key: string;
  name: string;
  sequence: number;
  default_duration_value: number | null;
  duration_unit: string | null;
  confirmation_required: boolean;
  supervisor_input_required: boolean;
  terminology_unconfirmed: boolean;
  enabled: boolean;
  mandatory: boolean;
};

export type LegacyRetainPreview = {
  stage_id: number;
  stage_key: string;
  name: string;
  reason: string;
};

export type ArchiveCandidatePreview = {
  stage_id: number;
  stage_key: string;
  name: string;
};

export type DirectorUpgradePreview = {
  planning_template_version: string | null;
  target_version: string;
  label: string;
  already_director: boolean;
  renames: RenamePreview[];
  duration_updates: DurationUpdatePreview[];
  adds: AddPreview[];
  legacy_retain: LegacyRetainPreview[];
  unused_archive_candidates: ArchiveCandidatePreview[];
  director_keys: string[];
};

const IDLE_STATUSES = new Set(['PLANNED', 'NOT_PLANNED']);

export function isStageInUse(
  stage: StageLike,
  deps: DepLike[] = [],
): { inUse: boolean; reason: string | null } {
  const assignees = stage.assignees?.length ?? 0;
  if (assignees > 0) {
    return { inUse: true, reason: `${assignees} assignee(s)` };
  }
  if (Number(stage.progress_pct || 0) > 0) {
    return { inUse: true, reason: `progress ${stage.progress_pct}%` };
  }
  if (stage.actual_start_at || stage.actual_finish_at) {
    return { inUse: true, reason: 'has actual start/finish' };
  }
  const st = String(stage.status || 'NOT_PLANNED').toUpperCase();
  if (!IDLE_STATUSES.has(st)) {
    return { inUse: true, reason: `status ${st}` };
  }
  const inDeps = deps.some(
    (d) => d.stage_id === stage.id || d.prerequisite_stage_id === stage.id,
  );
  if (inDeps) {
    return { inUse: true, reason: 'referenced by dependency' };
  }
  return { inUse: false, reason: null };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function durationMatches(
  stage: StageLike,
  def: DefaultStageDef,
  productiveHours: number,
): boolean {
  const wantMins = durationToMinutes(
    def.default_duration_value,
    def.duration_unit,
    productiveHours,
  );
  const haveMins = stage.planned_duration_minutes != null
    ? Number(stage.planned_duration_minutes)
    : durationToMinutes(
      numOrNull(stage.planned_duration_value),
      stage.duration_unit,
      productiveHours,
    );
  if (wantMins == null && haveMins == null) return true;
  if (wantMins == null || haveMins == null) return false;
  return wantMins === haveMins;
}

/** Resolve which Director key a stage currently represents (after rename map). */
export function resolveDirectorKey(stageKey: string): string {
  return LEGACY_TO_DIRECTOR_KEY[stageKey] || stageKey;
}

export function buildDirectorUpgradePreview(
  stages: StageLike[],
  deps: DepLike[],
  options: {
    planning_template_version?: string | null;
    productiveHours: number;
  },
): DirectorUpgradePreview {
  const directorDefs = DEFAULT_PANEL_STAGES;
  const directorKeySet = new Set(directorDefs.map((d) => d.stage_key));
  const byResolved = new Map<string, StageLike>();

  for (const s of stages) {
    const resolved = resolveDirectorKey(s.stage_key);
    // Prefer an already-correct Director key if both legacy+director somehow exist
    const existing = byResolved.get(resolved);
    if (!existing || (s.stage_key === resolved && existing.stage_key !== resolved)) {
      byResolved.set(resolved, s);
    }
  }

  const renames: RenamePreview[] = [];
  for (const s of stages) {
    const mapped = LEGACY_TO_DIRECTOR_KEY[s.stage_key];
    if (!mapped) continue;
    // Skip rename if target key already exists as a different row
    const targetExists = stages.some(
      (o) => o.id !== s.id && o.stage_key === mapped,
    );
    if (targetExists) continue;
    const def = directorDefs.find((d) => d.stage_key === mapped);
    renames.push({
      stage_id: s.id,
      from_key: s.stage_key,
      to_key: mapped,
      from_name: s.name,
      to_name: def?.name || mapped,
    });
  }

  const duration_updates: DurationUpdatePreview[] = [];
  for (const def of directorDefs) {
    if (def.default_duration_value == null && !def.duration_unit) continue;
    const stage = byResolved.get(def.stage_key);
    if (!stage) continue;
    if (durationMatches(stage, def, options.productiveHours)) continue;

    const { inUse } = isStageInUse(stage, deps);
    const customised = !durationMatches(stage, def, options.productiveHours)
      && (numOrNull(stage.planned_duration_value) != null
        || stage.planned_duration_minutes != null);
    const safe = !inUse;
    duration_updates.push({
      stage_id: stage.id,
      stage_key: resolveDirectorKey(stage.stage_key),
      from_value: numOrNull(stage.planned_duration_value),
      from_unit: stage.duration_unit || null,
      to_value: def.default_duration_value,
      to_unit: def.duration_unit,
      safe,
      warn: !safe
        ? 'Stage has progress/assignments — duration left unchanged unless unused'
        : customised
          ? 'Current duration differs from Director default; will update (no actuals)'
          : null,
    });
  }

  const adds: AddPreview[] = [];
  for (const def of directorDefs) {
    if (byResolved.has(def.stage_key)) continue;
    // Also skip if a pending rename will create this key
    if (renames.some((r) => r.to_key === def.stage_key)) continue;
    adds.push({
      stage_key: def.stage_key,
      name: def.name,
      sequence: def.sequence,
      default_duration_value: def.default_duration_value,
      duration_unit: def.duration_unit,
      confirmation_required: def.confirmation_required,
      supervisor_input_required: def.supervisor_input_required,
      terminology_unconfirmed: !!def.terminology_unconfirmed,
      enabled: def.enabled,
      mandatory: def.mandatory,
    });
  }

  const legacy_retain: LegacyRetainPreview[] = [];
  const unused_archive_candidates: ArchiveCandidatePreview[] = [];

  for (const s of stages) {
    const resolved = resolveDirectorKey(s.stage_key);
    const willBecomeDirector = !!LEGACY_TO_DIRECTOR_KEY[s.stage_key]
      && !stages.some((o) => o.id !== s.id && o.stage_key === resolved);
    if (willBecomeDirector) continue;
    if (directorKeySet.has(s.stage_key)) continue;

    const { inUse, reason } = isStageInUse(s, deps);
    if (inUse) {
      legacy_retain.push({
        stage_id: s.id,
        stage_key: s.stage_key,
        name: s.name,
        reason: reason || 'in use',
      });
    } else if (s.enabled !== false) {
      unused_archive_candidates.push({
        stage_id: s.id,
        stage_key: s.stage_key,
        name: s.name,
      });
    }
  }

  const version = options.planning_template_version || null;
  const already_director = version === DIRECTOR_WA1_TEMPLATE_CODE
    && adds.length === 0
    && renames.length === 0;

  return {
    planning_template_version: version,
    target_version: DIRECTOR_WA1_TEMPLATE_CODE,
    label: DIRECTOR_PLANNING_TEMPLATE_LABEL,
    already_director,
    renames,
    duration_updates: duration_updates.filter((d) => d.safe),
    adds,
    legacy_retain,
    unused_archive_candidates,
    director_keys: directorDefs.map((d) => d.stage_key),
  };
}
