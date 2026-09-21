/**
 * Canonical preparation event types for Supervisor/QA/Director reports.
 * Drawing / FINISHED must never invent these — only technician actions.
 */
export type CanonicalPrepEventType =
  | 'WIRE_CUT'
  | 'SRC_STRIPPED'
  | 'DST_STRIPPED'
  | 'SRC_FERRULE_OR_LUG_FITTED'
  | 'DST_FERRULE_OR_LUG_FITTED'
  | 'SRC_CRIMPED'
  | 'DST_CRIMPED'
  | 'READY_FOR_WIRING'
  | 'WIRING_FINISHED'
  | 'REWORK_RAISED'
  | 'REWORK_RESOLVED';

export type PrepEventSide = 'Source' | 'Destination' | 'Both' | null;

export interface CanonicalPrepEvent {
  event_type: CanonicalPrepEventType;
  project_id: string;
  panel_id: string;
  assignment_id: number | string;
  wire_id: string;
  side: PrepEventSide;
  technician_id: number | null;
  technician_name?: string | null;
  timestamp: string;
  rework_cycle: number;
  remarks?: string | null;
  /** Internal audit action that produced this event (traceability). */
  source_audit_action?: string | null;
}

import type { PrepAuditAction } from './crimping';

const AUDIT_TO_CANONICAL: Partial<Record<Exclude<PrepAuditAction, null>, CanonicalPrepEventType>> = {
  wire_cut: 'WIRE_CUT',
  source_stripped: 'SRC_STRIPPED',
  destination_stripped: 'DST_STRIPPED',
  wire_stripped: 'SRC_STRIPPED', // whole-wire strip fans out; callers should emit both ends
  source_crimped: 'SRC_CRIMPED',
  destination_crimped: 'DST_CRIMPED',
  wire_crimped: 'SRC_CRIMPED',
  CRIMP_SOURCE_COMPLETED: 'SRC_CRIMPED',
  CRIMP_DESTINATION_COMPLETED: 'DST_CRIMPED',
};

export function mapAuditActionToCanonical(
  action: PrepAuditAction | string | null | undefined,
): CanonicalPrepEventType | null {
  if (!action) return null;
  const key = String(action) as Exclude<PrepAuditAction, null>;
  if (AUDIT_TO_CANONICAL[key]) return AUDIT_TO_CANONICAL[key]!;
  const upper = String(action).toUpperCase();
  if (upper === 'WIRE_CUT' || upper === 'SRC_STRIPPED' || upper === 'DST_STRIPPED') {
    return upper as CanonicalPrepEventType;
  }
  if (upper.includes('REWORK') && upper.includes('RESOLVE')) return 'REWORK_RESOLVED';
  if (upper.includes('REWORK')) return 'REWORK_RAISED';
  if (upper.includes('FINISH') || upper === 'WIRING_FINISHED') return 'WIRING_FINISHED';
  if (upper.includes('READY')) return 'READY_FOR_WIRING';
  return null;
}

export function sideForCanonicalEvent(eventType: CanonicalPrepEventType): PrepEventSide {
  if (eventType.startsWith('SRC_')) return 'Source';
  if (eventType.startsWith('DST_')) return 'Destination';
  if (eventType === 'WIRE_CUT' || eventType === 'READY_FOR_WIRING' || eventType === 'WIRING_FINISHED') {
    return 'Both';
  }
  return null;
}

export function buildCanonicalPrepEvent(input: {
  auditAction: PrepAuditAction | string | null | undefined;
  project_id: string;
  panel_id: string;
  assignment_id: number | string;
  wire_id: string;
  technician_id: number | null;
  technician_name?: string | null;
  timestamp?: string;
  rework_cycle?: number;
  remarks?: string | null;
  /** Override when whole-wire strip/crimp must emit a specific end. */
  forceEventType?: CanonicalPrepEventType | null;
}): CanonicalPrepEvent | null {
  const event_type = input.forceEventType || mapAuditActionToCanonical(input.auditAction);
  if (!event_type) return null;
  return {
    event_type,
    project_id: input.project_id,
    panel_id: input.panel_id,
    assignment_id: input.assignment_id,
    wire_id: input.wire_id,
    side: sideForCanonicalEvent(event_type),
    technician_id: input.technician_id,
    technician_name: input.technician_name ?? null,
    timestamp: input.timestamp || new Date().toISOString(),
    rework_cycle: input.rework_cycle ?? 0,
    remarks: input.remarks ?? null,
    source_audit_action: input.auditAction ? String(input.auditAction) : null,
  };
}
