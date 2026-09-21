/**
 * Pure assignment lifecycle + action-policy helpers.
 * Used by TechService, Supervisor, and Panel Workflow projections.
 */

export type AssignmentLifecycle =
  | 'UNASSIGNED'
  | 'ASSIGNED_NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED';

export type AssignmentActionPolicy = {
  can_assign: boolean;
  can_reassign: boolean;
  can_mid_change: boolean;
  lifecycle: AssignmentLifecycle;
};

export type AssignmentLifecycleInput = {
  status?: string | null;
  started_at?: Date | string | null;
  changeover_locked?: boolean | null;
  handover_from_id?: number | null;
  cable_status?: string | null;
  cables_src_done?: number | null;
  cables_dst_done?: number | null;
} | null | undefined;

function parseCableStatus(raw: string | null | undefined): Record<string, { src?: boolean; dst?: boolean }> {
  try {
    const obj = JSON.parse(raw || '{}');
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

/** True when any cable end is marked done or counters are non-zero. */
export function hasAssignmentCableWork(assignment: AssignmentLifecycleInput): boolean {
  if (!assignment) return false;
  if ((assignment.cables_src_done || 0) > 0 || (assignment.cables_dst_done || 0) > 0) return true;
  return Object.values(parseCableStatus(assignment.cable_status)).some(
    (state) => Boolean(state?.src || state?.dst),
  );
}

/**
 * Virgin panel assignment: assigned, never started, no mid-change lineage, no cable work.
 * Eligible for delete / reassign-before-start (not Mid Change).
 */
export function isAssignableBeforeStart(assignment: AssignmentLifecycleInput): boolean {
  if (!assignment) return false;
  return (
    String(assignment.status || '') === 'assigned'
    && assignment.started_at == null
    && !assignment.changeover_locked
    && assignment.handover_from_id == null
    && !hasAssignmentCableWork(assignment)
  );
}

/**
 * Derive UI/API lifecycle from assignment status and progress signals.
 * `assigned` with started_at, cable work, or handover_from_id → IN_PROGRESS
 * (Mid Change path — not reassign-before-start).
 */
export function deriveAssignmentLifecycle(assignment: AssignmentLifecycleInput): AssignmentLifecycle {
  if (!assignment) return 'UNASSIGNED';

  const status = String(assignment.status || '').toLowerCase();
  // reassigned / mid_changed are closed transfer outcomes (VARCHAR(20)-safe codes).
  if (!status || status === 'reassigned' || status === 'mid_changed') return 'UNASSIGNED';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'paused') return 'PAUSED';
  if (status === 'in_progress') return 'IN_PROGRESS';

  if (status === 'assigned') {
    if (
      assignment.started_at != null
      || assignment.handover_from_id != null
      || hasAssignmentCableWork(assignment)
    ) {
      return 'IN_PROGRESS';
    }
    return 'ASSIGNED_NOT_STARTED';
  }

  return 'UNASSIGNED';
}

export function assignmentActionPolicy(lifecycle: AssignmentLifecycle): AssignmentActionPolicy {
  return {
    lifecycle,
    can_assign: lifecycle === 'UNASSIGNED',
    can_reassign: lifecycle === 'ASSIGNED_NOT_STARTED',
    can_mid_change: lifecycle === 'IN_PROGRESS' || lifecycle === 'PAUSED',
  };
}

export function buildAssignmentActionPolicy(assignment: AssignmentLifecycleInput): AssignmentActionPolicy {
  return assignmentActionPolicy(deriveAssignmentLifecycle(assignment));
}
