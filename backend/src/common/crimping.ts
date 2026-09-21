/**
 * DWES Crimping / Preparation domain — pure helpers (no Nest/Prisma).
 * Persisted as additive JSON on tech_assignments.cable_status[i].crimping
 * (same pattern as openEnd). WiringSchemeDB schema is not altered.
 *
 * CR-04A: nested per-end stripping + crimping. Flat CR-01→CR-04 shapes
 * are accepted on read via normalizeCrimping (never invents stripping).
 */

export type PrepEndStatus =
  | 'NOT_STARTED'
  | 'COMPLETED'
  | 'REWORK_REQUIRED'
  | 'NOT_APPLICABLE';

/** @deprecated Alias kept for older imports / audit docs */
export type CrimpEndStatus = PrepEndStatus;

export type CrimpOverall =
  | 'NOT_REQUIRED'
  | 'NOT_STARTED'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'REWORK_REQUIRED';

export type OpenEndSide = 'source' | 'destination' | 'both' | null | undefined;

export type CrimpingOperation = 'strip' | 'crimp';

/* ── V2 Whole-Wire Preparation stage types ── */

export type CutStatus = 'NOT_STARTED' | 'COMPLETED';

export interface CutStage {
  status: CutStatus;
  plannedLength?: string;
  actualLength?: string;
  by?: number;
  at?: string;
}

export type WireStageStatus = PrepEndStatus;

export interface WireStripStage {
  status: WireStageStatus;
  by?: number;
  at?: string;
}

export interface WireCrimpStage {
  status: WireStageStatus;
  by?: number;
  at?: string;
}

export interface CrimpingEndState {
  strippingStatus: PrepEndStatus;
  crimpingStatus: PrepEndStatus;
  strippedBy?: number;
  strippedAt?: string;
  crimpedBy?: number;
  crimpedAt?: string;
  /** Additive rework history — never deletes prior attribution. */
  reworkHistory?: Array<{
    operation: CrimpingOperation;
    previousStatus: string;
    reason: string;
    setBy: number;
    setAt: string;
    role?: string;
  }>;
}

export interface CrimpingState {
  required: boolean;
  source: CrimpingEndState;
  destination: CrimpingEndState;
  overall: CrimpOverall;
  remarks?: string;
  revision?: number;
  updatedAt?: string;
  updatedBy?: number;
  /** Grandfather stamp: wire already had wiring complete before Crimping activation. */
  legacyWiringCompleted?: boolean;
  /** Crimp recorded (legacy flat) without stripping ever captured. */
  legacyCrimpWithoutStrip?: boolean;
  /** V2 Whole-Wire Preparation: wire cutting stage. */
  cut?: CutStage;
  /** V2 Whole-Wire Preparation: wire-level strip (both applicable ends atomically). */
  wireStrip?: WireStripStage;
  /** V2 Whole-Wire Preparation: wire-level crimp (both applicable ends atomically). */
  wireCrimp?: WireCrimpStage;
  /** Legacy partial: exactly one applicable end was prep-complete without V2 stages. */
  legacyPartial?: boolean;
  /** QA hold: supervisor/QAQC placed wire on hold — blocks readiness. */
  qaHold?: boolean;
}

/** Raw on-disk / API partial — may be flat CR-01 or nested CR-04A. */
export type CrimpingRaw = Record<string, unknown> | Partial<CrimpingState> | null | undefined;

export interface CableStatusLike {
  src?: boolean;
  dst?: boolean;
  openEnd?: OpenEndSide;
  crimping?: CrimpingRaw;
}

export const CRIMPING_NOT_COMPLETED_CODE = 'CRIMPING_NOT_COMPLETED';
export const SOURCE_STRIPPING_REQUIRED_CODE = 'SOURCE_STRIPPING_REQUIRED';
export const DESTINATION_STRIPPING_REQUIRED_CODE = 'DESTINATION_STRIPPING_REQUIRED';
export const STAGED_PREPARATION_REQUIRED_CODE = 'STAGED_PREPARATION_REQUIRED';

export function defaultEndState(): CrimpingEndState {
  return {
    strippingStatus: 'NOT_STARTED',
    crimpingStatus: 'NOT_STARTED',
  };
}

export function defaultCrimpingState(): CrimpingState {
  return {
    required: false,
    source: defaultEndState(),
    destination: defaultEndState(),
    overall: 'NOT_REQUIRED',
  };
}

function isPrepStatus(v: unknown): v is PrepEndStatus {
  return v === 'NOT_STARTED'
    || v === 'COMPLETED'
    || v === 'REWORK_REQUIRED'
    || v === 'NOT_APPLICABLE';
}

function isOverall(v: unknown): v is CrimpOverall {
  return v === 'NOT_REQUIRED'
    || v === 'NOT_STARTED'
    || v === 'PARTIAL'
    || v === 'COMPLETED'
    || v === 'REWORK_REQUIRED';
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function isNestedEnd(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
    && ('strippingStatus' in (v as object) || 'crimpingStatus' in (v as object));
}

/* ── V2 stage coercion helpers ── */

function coerceCutStage(raw: unknown): CutStage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    status: r.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_STARTED',
    plannedLength: strOrUndef(r.plannedLength),
    actualLength: strOrUndef(r.actualLength),
    by: numOrUndef(r.by),
    at: strOrUndef(r.at),
  };
}

function coerceWireStripStage(raw: unknown): WireStripStage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    status: isPrepStatus(r.status) ? r.status : 'NOT_STARTED',
    by: numOrUndef(r.by),
    at: strOrUndef(r.at),
  };
}

function coerceWireCrimpStage(raw: unknown): WireCrimpStage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    status: isPrepStatus(r.status) ? r.status : 'NOT_STARTED',
    by: numOrUndef(r.by),
    at: strOrUndef(r.at),
  };
}

/**
 * Coerce one end from nested object OR flat CR-01 string + sibling attribution.
 * Never invents stripping completion from crimping.
 */
export function coerceEndState(
  endRaw: unknown,
  flatBy?: unknown,
  flatAt?: unknown,
): CrimpingEndState {
  if (isNestedEnd(endRaw)) {
    const history = Array.isArray(endRaw.reworkHistory) ? endRaw.reworkHistory : undefined;
    return {
      strippingStatus: isPrepStatus(endRaw.strippingStatus) ? endRaw.strippingStatus : 'NOT_STARTED',
      crimpingStatus: isPrepStatus(endRaw.crimpingStatus) ? endRaw.crimpingStatus : 'NOT_STARTED',
      strippedBy: numOrUndef(endRaw.strippedBy),
      strippedAt: strOrUndef(endRaw.strippedAt),
      crimpedBy: numOrUndef(endRaw.crimpedBy),
      crimpedAt: strOrUndef(endRaw.crimpedAt),
      ...(history ? { reworkHistory: history as CrimpingEndState['reworkHistory'] } : {}),
    };
  }
  if (isPrepStatus(endRaw)) {
    if (endRaw === 'NOT_APPLICABLE') {
      return { strippingStatus: 'NOT_APPLICABLE', crimpingStatus: 'NOT_APPLICABLE' };
    }
    return {
      strippingStatus: 'NOT_STARTED',
      crimpingStatus: endRaw,
      crimpedBy: endRaw === 'COMPLETED' ? numOrUndef(flatBy) : undefined,
      crimpedAt: endRaw === 'COMPLETED' ? strOrUndef(flatAt) : undefined,
    };
  }
  return defaultEndState();
}

function endHasLegacyCrimpWithoutStrip(end: CrimpingEndState): boolean {
  return end.crimpingStatus === 'COMPLETED'
    && end.strippingStatus === 'NOT_STARTED';
}

/** Normalize missing/partial/flat/nested crimping JSON; apply OPEN END. */
export function normalizeCrimping(
  raw: CrimpingRaw,
  openEnd?: OpenEndSide,
): CrimpingState {
  const base = defaultCrimpingState();
  if (!raw || typeof raw !== 'object') {
    return applyOpenEndEligibility(base, openEnd);
  }
  const r = raw as Record<string, unknown>;
  const source = coerceEndState(r.source, r.sourceBy, r.sourceAt);
  const destination = coerceEndState(r.destination, r.destinationBy, r.destinationAt);
  const legacyFlag = r.legacyCrimpWithoutStrip === true
    || endHasLegacyCrimpWithoutStrip(source)
    || endHasLegacyCrimpWithoutStrip(destination);

  const next: CrimpingState = {
    required: Boolean(r.required),
    source,
    destination,
    overall: isOverall(r.overall) ? r.overall : 'NOT_REQUIRED',
    remarks: strOrUndef(r.remarks),
    revision: numOrUndef(r.revision),
    updatedAt: strOrUndef(r.updatedAt),
    updatedBy: numOrUndef(r.updatedBy),
    legacyWiringCompleted: r.legacyWiringCompleted === true ? true : undefined,
    legacyCrimpWithoutStrip: legacyFlag ? true : undefined,
    qaHold: r.qaHold === true ? true : undefined,
  };
  const withEnds = applyOpenEndEligibility(next, openEnd);
  withEnds.overall = deriveOverall(withEnds);

  // V2 Whole-Wire Preparation stage normalization
  const rawCut = coerceCutStage(r.cut);
  const rawWireStrip = coerceWireStripStage(r.wireStrip);
  const rawWireCrimp = coerceWireCrimpStage(r.wireCrimp);
  const hasV2Stages = rawCut !== undefined || rawWireStrip !== undefined || rawWireCrimp !== undefined;

  if (hasV2Stages) {
    withEnds.cut = rawCut;
    withEnds.wireStrip = rawWireStrip;
    withEnds.wireCrimp = rawWireCrimp;
    if (r.legacyPartial === true) withEnds.legacyPartial = true;
  } else if (withEnds.required) {
    const prepEnds = applicablePrepEnds(withEnds);
    const completedCount = prepEnds.filter((e) => endPreparationComplete(withEnds[e])).length;
    if (completedCount === prepEnds.length) {
      // Legacy both-ends complete → synthesize wire-level stages
      withEnds.cut = { status: 'COMPLETED' };
      withEnds.wireStrip = { status: 'COMPLETED' };
      withEnds.wireCrimp = { status: 'COMPLETED' };
    } else if (completedCount === 1 && prepEnds.length > 1) {
      withEnds.legacyPartial = true;
    }
  }

  // Both applicable ends prepared: clear legacyPartial and fill missing V2 stages
  // so per-end strip/crimp unlocks wiring the same way as Whole-Wire stages.
  if (withEnds.required) {
    const ends = applicablePrepEnds(withEnds);
    if (ends.length > 0 && ends.every((e) => endPreparationComplete(withEnds[e]))) {
      if (withEnds.legacyPartial) delete withEnds.legacyPartial;
      if (!withEnds.cut || withEnds.cut.status !== 'COMPLETED') {
        withEnds.cut = { status: 'COMPLETED', ...(withEnds.cut || {}) };
      }
      if (!withEnds.wireStrip || (withEnds.wireStrip.status !== 'COMPLETED' && withEnds.wireStrip.status !== 'NOT_APPLICABLE')) {
        withEnds.wireStrip = { status: 'COMPLETED', ...(withEnds.wireStrip || {}) };
      }
      if (!withEnds.wireCrimp || (withEnds.wireCrimp.status !== 'COMPLETED' && withEnds.wireCrimp.status !== 'NOT_APPLICABLE')) {
        withEnds.wireCrimp = { status: 'COMPLETED', ...(withEnds.wireCrimp || {}) };
      }
    }
  }

  return withEnds;
}

export function applyOpenEndEligibility(
  state: CrimpingState,
  openEnd?: OpenEndSide,
): CrimpingState {
  const next: CrimpingState = {
    ...state,
    source: { ...state.source },
    destination: { ...state.destination },
  };
  if (openEnd === 'source' || openEnd === 'both') {
    next.source = {
      strippingStatus: 'NOT_APPLICABLE',
      crimpingStatus: 'NOT_APPLICABLE',
    };
  }
  if (openEnd === 'destination' || openEnd === 'both') {
    next.destination = {
      strippingStatus: 'NOT_APPLICABLE',
      crimpingStatus: 'NOT_APPLICABLE',
    };
  }
  return next;
}

export function applicablePrepEnds(state: CrimpingState): Array<'source' | 'destination'> {
  const ends: Array<'source' | 'destination'> = [];
  if (state.source.crimpingStatus !== 'NOT_APPLICABLE') ends.push('source');
  if (state.destination.crimpingStatus !== 'NOT_APPLICABLE') ends.push('destination');
  return ends;
}

/** @deprecated Use applicablePrepEnds */
export function applicableCrimpEnds(state: CrimpingState): Array<'source' | 'destination'> {
  return applicablePrepEnds(state);
}

/** End is preparation-complete when both strip and crimp are COMPLETED (or N/A). */
export function endPreparationComplete(end: CrimpingEndState): boolean {
  if (end.strippingStatus === 'NOT_APPLICABLE' && end.crimpingStatus === 'NOT_APPLICABLE') {
    return true;
  }
  return end.strippingStatus === 'COMPLETED' && end.crimpingStatus === 'COMPLETED';
}

export function deriveOverall(state: CrimpingState): CrimpOverall {
  if (!state.required) return 'NOT_REQUIRED';
  if (
    state.source.strippingStatus === 'REWORK_REQUIRED'
    || state.source.crimpingStatus === 'REWORK_REQUIRED'
    || state.destination.strippingStatus === 'REWORK_REQUIRED'
    || state.destination.crimpingStatus === 'REWORK_REQUIRED'
  ) {
    return 'REWORK_REQUIRED';
  }
  const ends = applicablePrepEnds(state);
  if (ends.length === 0) return 'COMPLETED';
  const completed = ends.filter((side) => endPreparationComplete(state[side])).length;
  if (completed === 0) {
    const anyProgress = ends.some((side) => {
      const e = state[side];
      return e.strippingStatus === 'COMPLETED' || e.crimpingStatus === 'COMPLETED';
    });
    return anyProgress ? 'PARTIAL' : 'NOT_STARTED';
  }
  if (completed === ends.length) return 'COMPLETED';
  return 'PARTIAL';
}

/**
 * V2 readiness check: wire has completed all Whole-Wire Preparation stages.
 * Returns true only for required wires with all stages done and no open rework.
 */
export function isReadyForWiring(state: CrimpingState): boolean {
  if (!state.required) return false;
  if (state.qaHold) return false;
  if (state.cut?.status !== 'COMPLETED') return false;
  const stripOk = state.wireStrip?.status === 'COMPLETED'
    || state.wireStrip?.status === 'NOT_APPLICABLE';
  // Prefer explicit wireCrimp stage; fall back when both applicable ends are crimped
  // (covers older rows written before per-end crimp closed the wire-level stage).
  const ends = applicablePrepEnds(state);
  const endsCrimped = ends.length > 0 && ends.every((e) => state[e].crimpingStatus === 'COMPLETED');
  const crimpOk = state.wireCrimp?.status === 'COMPLETED'
    || state.wireCrimp?.status === 'NOT_APPLICABLE'
    || endsCrimped;
  if (!stripOk || !crimpOk) return false;
  if (state.legacyPartial) return false;
  if (state.source.strippingStatus === 'REWORK_REQUIRED'
    || state.source.crimpingStatus === 'REWORK_REQUIRED'
    || state.destination.strippingStatus === 'REWORK_REQUIRED'
    || state.destination.crimpingStatus === 'REWORK_REQUIRED') return false;
  if (state.wireStrip?.status === 'REWORK_REQUIRED'
    || state.wireCrimp?.status === 'REWORK_REQUIRED') return false;
  return true;
}

/**
 * Per-wire wiring hard gate.
 * Locked when required, not legacy-grandfathered, and not ready for wiring.
 * Also locks on legacyPartial (exactly one end prepared without V2 stages).
 */
export function isWiringLockedByCrimping(cable: CableStatusLike | null | undefined): boolean {
  const openEnd = cable?.openEnd ?? null;
  const crimping = normalizeCrimping(cable?.crimping, openEnd);
  if (!crimping.required) return false;
  if (crimping.legacyWiringCompleted) return false;
  return !isReadyForWiring(crimping);
}

export function crimpingGateMessage(cableIndex: number): string {
  return `CRIMPING NOT COMPLETED. Complete Source and Destination Stripping and Crimping before Wiring wire ${cableIndex + 1}.`;
}

export function strippingRequiredCode(end: 'source' | 'destination'): string {
  return end === 'source' ? SOURCE_STRIPPING_REQUIRED_CODE : DESTINATION_STRIPPING_REQUIRED_CODE;
}

export function strippingRequiredMessage(end: 'source' | 'destination'): string {
  return end === 'source'
    ? 'SOURCE STRIPPING REQUIRED'
    : 'DESTINATION STRIPPING REQUIRED';
}

export type PrepAuditAction =
  | 'source_stripped'
  | 'source_crimped'
  | 'destination_stripped'
  | 'destination_crimped'
  | 'CRIMP_SOURCE_COMPLETED'
  | 'CRIMP_DESTINATION_COMPLETED'
  | 'wire_prepared'
  | 'wire_reprepared'
  | 'wire_cut'
  | 'wire_stripped'
  | 'wire_crimped'
  | 'legacy_partial_resolved'
  | null;

export interface CrimpingMarkResult {
  state: CrimpingState;
  changed: boolean;
  auditAction: PrepAuditAction;
  previousStatus?: string;
  newStatus?: string;
  /** Per-end transitions from whole-wire prepare (for audit fan-out). */
  endAudits?: Array<{ end: 'source' | 'destination'; operation: CrimpingOperation; auditAction: PrepAuditAction }>;
  clearedRework?: boolean;
}

export interface WirePreparedResult extends CrimpingMarkResult {
  endAudits: Array<{ end: 'source' | 'destination'; operation: CrimpingOperation; auditAction: PrepAuditAction }>;
  clearedRework: boolean;
}

/** Mark stripping complete for one applicable end. Idempotent if already COMPLETED. */
export function markStripEndComplete(
  cable: CableStatusLike,
  end: 'source' | 'destination',
  technicianId: number,
  atIso: string = new Date().toISOString(),
): CrimpingMarkResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }
  const side = state[end];
  if (side.strippingStatus === 'NOT_APPLICABLE') {
    throw new Error(`${end} end is not applicable for Stripping (OPEN END)`);
  }
  if (side.strippingStatus === 'COMPLETED') {
    return { state, changed: false, auditAction: null };
  }
  const previousStatus = side.strippingStatus;
  side.strippingStatus = 'COMPLETED';
  side.strippedBy = technicianId;
  side.strippedAt = atIso;
  if (state.legacyCrimpWithoutStrip) {
    const stillLegacy = endHasLegacyCrimpWithoutStrip(state.source)
      || endHasLegacyCrimpWithoutStrip(state.destination);
    if (!stillLegacy) delete state.legacyCrimpWithoutStrip;
  }
  state.updatedAt = atIso;
  state.updatedBy = technicianId;
  state.revision = (state.revision || 0) + 1;
  state.overall = deriveOverall(state);
  return {
    state,
    changed: true,
    auditAction: end === 'source' ? 'source_stripped' : 'destination_stripped',
    previousStatus,
    newStatus: 'COMPLETED',
  };
}

/**
 * Mark crimping complete for one applicable end.
 * Requires same-end stripping COMPLETED first (never invents strip).
 */
export function markCrimpEndComplete(
  cable: CableStatusLike,
  end: 'source' | 'destination',
  technicianId: number,
  atIso: string = new Date().toISOString(),
): CrimpingMarkResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }
  const side = state[end];
  if (side.crimpingStatus === 'NOT_APPLICABLE') {
    throw new Error(`${end} end is not applicable for Crimping (OPEN END)`);
  }
  if (side.crimpingStatus === 'COMPLETED') {
    return { state, changed: false, auditAction: null };
  }
  if (side.strippingStatus !== 'COMPLETED') {
    const err = new Error(strippingRequiredMessage(end)) as Error & { code?: string };
    err.code = strippingRequiredCode(end);
    throw err;
  }
  const previousStatus = side.crimpingStatus;
  side.crimpingStatus = 'COMPLETED';
  side.crimpedBy = technicianId;
  side.crimpedAt = atIso;
  // When every applicable end is crimped, close the wire-level stage so READY_FOR_WIRING unlocks.
  const ends = applicablePrepEnds(state);
  if (ends.length > 0 && ends.every((e) => state[e].crimpingStatus === 'COMPLETED')) {
    if (!state.wireCrimp || state.wireCrimp.status !== 'COMPLETED') {
      state.wireCrimp = {
        status: 'COMPLETED',
        by: state.wireCrimp?.by ?? technicianId,
        at: state.wireCrimp?.at ?? atIso,
      };
    }
    // Completing the last end clears legacyPartial and synthesizes missing cut/strip.
    if (state.legacyPartial) delete state.legacyPartial;
    if (!state.cut || state.cut.status !== 'COMPLETED') {
      state.cut = { status: 'COMPLETED', by: state.cut?.by ?? technicianId, at: state.cut?.at ?? atIso };
    }
    if (!state.wireStrip || (state.wireStrip.status !== 'COMPLETED' && state.wireStrip.status !== 'NOT_APPLICABLE')) {
      state.wireStrip = { status: 'COMPLETED', by: state.wireStrip?.by ?? technicianId, at: state.wireStrip?.at ?? atIso };
    }
  }
  state.updatedAt = atIso;
  state.updatedBy = technicianId;
  state.revision = (state.revision || 0) + 1;
  state.overall = deriveOverall(state);
  return {
    state,
    changed: true,
    auditAction: end === 'source' ? 'source_crimped' : 'destination_crimped',
    previousStatus,
    newStatus: 'COMPLETED',
  };
}

/** Convenience: apply strip or crimp operation. */
export function markPrepOperation(
  cable: CableStatusLike,
  end: 'source' | 'destination',
  operation: CrimpingOperation,
  technicianId: number,
  atIso?: string,
): CrimpingMarkResult {
  if (operation === 'strip') {
    return markStripEndComplete(cable, end, technicianId, atIso);
  }
  return markCrimpEndComplete(cable, end, technicianId, atIso);
}

/**
 * Complete strip (then crimp) for one end while preserving original by/at
 * when clearing REWORK_REQUIRED. Mutates the provided CrimpingState in place.
 */
function completeEndFromState(
  state: CrimpingState,
  end: 'source' | 'destination',
  technicianId: number,
  atIso: string,
): Array<{ end: 'source' | 'destination'; operation: CrimpingOperation; auditAction: PrepAuditAction }> {
  const audits: Array<{ end: 'source' | 'destination'; operation: CrimpingOperation; auditAction: PrepAuditAction }> = [];
  const side = state[end];
  if (side.strippingStatus === 'NOT_APPLICABLE' && side.crimpingStatus === 'NOT_APPLICABLE') {
    return audits;
  }

  if (side.strippingStatus !== 'NOT_APPLICABLE' && side.strippingStatus !== 'COMPLETED') {
    const prev = side.strippingStatus;
    const keepOriginal = prev === 'REWORK_REQUIRED' && side.strippedBy != null;
    side.strippingStatus = 'COMPLETED';
    if (!keepOriginal) {
      side.strippedBy = technicianId;
      side.strippedAt = atIso;
    } else {
      side.reworkHistory = [
        ...(side.reworkHistory || []),
        {
          operation: 'strip',
          previousStatus: 'REWORK_REQUIRED',
          reason: 'Re-prepared (strip)',
          setBy: technicianId,
          setAt: atIso,
          role: 'wiring_technician',
        },
      ];
    }
    audits.push({
      end,
      operation: 'strip',
      auditAction: end === 'source' ? 'source_stripped' : 'destination_stripped',
    });
  }

  if (side.crimpingStatus !== 'NOT_APPLICABLE' && side.crimpingStatus !== 'COMPLETED') {
    if (side.strippingStatus !== 'COMPLETED' && side.strippingStatus !== 'NOT_APPLICABLE') {
      const err = new Error(strippingRequiredMessage(end)) as Error & { code?: string };
      err.code = strippingRequiredCode(end);
      throw err;
    }
    const prev = side.crimpingStatus;
    const keepOriginal = prev === 'REWORK_REQUIRED' && side.crimpedBy != null;
    side.crimpingStatus = 'COMPLETED';
    if (!keepOriginal) {
      side.crimpedBy = technicianId;
      side.crimpedAt = atIso;
    } else {
      side.reworkHistory = [
        ...(side.reworkHistory || []),
        {
          operation: 'crimp',
          previousStatus: 'REWORK_REQUIRED',
          reason: 'Re-prepared (crimp)',
          setBy: technicianId,
          setAt: atIso,
          role: 'wiring_technician',
        },
      ];
    }
    audits.push({
      end,
      operation: 'crimp',
      auditAction: end === 'source' ? 'source_crimped' : 'destination_crimped',
    });
  }

  return audits;
}

/**
 * Atomic whole-wire preparation: mark every applicable SRC/DST strip+crimp complete
 * in one in-memory mutation. Idempotent when already COMPLETED with no rework.
 * Open-end sides stay NOT_APPLICABLE (never falsely completed).
 */
export function markWirePrepared(
  cable: CableStatusLike,
  technicianId: number,
  atIso: string = new Date().toISOString(),
): WirePreparedResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }

  const clearedRework = state.overall === 'REWORK_REQUIRED'
    || state.source.strippingStatus === 'REWORK_REQUIRED'
    || state.source.crimpingStatus === 'REWORK_REQUIRED'
    || state.destination.strippingStatus === 'REWORK_REQUIRED'
    || state.destination.crimpingStatus === 'REWORK_REQUIRED';

  if (state.overall === 'COMPLETED' && !clearedRework) {
    return {
      state,
      changed: false,
      auditAction: null,
      endAudits: [],
      clearedRework: false,
    };
  }

  // Reject when V2 staged preparation is incomplete and no rework to clear.
  // Technicians must use Cut → Strip → Crimp stages; prepare-wire is only
  // allowed as idempotent no-op (handled above) or rework re-prepare.
  if (!clearedRework && !state.legacyPartial && !state.legacyCrimpWithoutStrip) {
    const cutOk = state.cut?.status === 'COMPLETED';
    const stripOk = state.wireStrip?.status === 'COMPLETED'
      || state.wireStrip?.status === 'NOT_APPLICABLE';
    const crimpOk = state.wireCrimp?.status === 'COMPLETED'
      || state.wireCrimp?.status === 'NOT_APPLICABLE';
    if (!cutOk || !stripOk || !crimpOk) {
      const err = new Error(
        'Staged Cut → Strip → Crimp preparation is required. Use Mark Wire Cut, Mark Both Ends Stripped, then Mark Both Ends Crimped.',
      ) as Error & { code?: string };
      err.code = STAGED_PREPARATION_REQUIRED_CODE;
      throw err;
    }
  }

  // Deep-clone ends so a throw never leaves a half-mutated caller object.
  const working: CrimpingState = {
    ...state,
    source: {
      ...state.source,
      reworkHistory: state.source.reworkHistory ? [...state.source.reworkHistory] : undefined,
    },
    destination: {
      ...state.destination,
      reworkHistory: state.destination.reworkHistory ? [...state.destination.reworkHistory] : undefined,
    },
  };

  const endAudits = [
    ...completeEndFromState(working, 'source', technicianId, atIso),
    ...completeEndFromState(working, 'destination', technicianId, atIso),
  ];

  working.updatedAt = atIso;
  working.updatedBy = technicianId;
  working.revision = (working.revision || 0) + 1;
  working.overall = deriveOverall(working);

  if (working.legacyCrimpWithoutStrip) {
    const stillLegacy = endHasLegacyCrimpWithoutStrip(working.source)
      || endHasLegacyCrimpWithoutStrip(working.destination);
    if (!stillLegacy) delete working.legacyCrimpWithoutStrip;
  }

  const changed = endAudits.length > 0 || working.overall !== state.overall;
  return {
    state: working,
    changed,
    auditAction: clearedRework ? 'wire_reprepared' : 'wire_prepared',
    previousStatus: state.overall,
    newStatus: working.overall,
    endAudits,
    clearedRework,
  };
}

/* ── V2 Whole-Wire Preparation mark functions ── */

/** Mark wire-cut complete. Idempotent if already COMPLETED. */
export function markWireCut(
  cable: CableStatusLike,
  technicianId: number,
  opts: { plannedLength?: string; actualLength?: string } = {},
  atIso: string = new Date().toISOString(),
): CrimpingMarkResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }
  if (state.cut?.status === 'COMPLETED') {
    return { state, changed: false, auditAction: null };
  }
  state.cut = {
    status: 'COMPLETED',
    plannedLength: opts.plannedLength,
    actualLength: opts.actualLength,
    by: technicianId,
    at: atIso,
  };
  state.updatedAt = atIso;
  state.updatedBy = technicianId;
  state.revision = (state.revision || 0) + 1;
  return {
    state,
    changed: true,
    auditAction: 'wire_cut',
  };
}

/**
 * Atomic both-applicable-ends strip COMPLETED + wireStrip COMPLETED.
 * Requires cut COMPLETED first.
 * Re-completing clears open stripping REWORK_REQUIRED without erasing original by/at.
 */
export function markBothEndsStripped(
  cable: CableStatusLike,
  technicianId: number,
  atIso: string = new Date().toISOString(),
): CrimpingMarkResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }
  if (state.cut?.status !== 'COMPLETED') {
    const err: any = new Error('Wire must be cut before stripping');
    err.code = 'STAGE_ORDER_VIOLATION';
    throw err;
  }
  const ends = applicablePrepEnds(state);
  const hasStripRework = ends.some((end) => state[end].strippingStatus === 'REWORK_REQUIRED')
    || state.wireStrip?.status === 'REWORK_REQUIRED';
  if (state.wireStrip?.status === 'COMPLETED' && !hasStripRework) {
    return { state, changed: false, auditAction: null };
  }
  let clearedRework = false;
  for (const end of ends) {
    const side = state[end];
    if (side.strippingStatus === 'REWORK_REQUIRED') {
      clearedRework = true;
      side.strippingStatus = 'COMPLETED';
      // Preserve original strippedBy/strippedAt; stamp repair actor on update fields only
      if (side.strippedBy == null) side.strippedBy = technicianId;
      if (!side.strippedAt) side.strippedAt = atIso;
    } else if (side.strippingStatus !== 'COMPLETED') {
      side.strippingStatus = 'COMPLETED';
      side.strippedBy = technicianId;
      side.strippedAt = atIso;
    }
  }
  state.wireStrip = { status: 'COMPLETED', by: state.wireStrip?.by ?? technicianId, at: state.wireStrip?.at ?? atIso };
  if (state.legacyCrimpWithoutStrip) {
    const stillLegacy = endHasLegacyCrimpWithoutStrip(state.source)
      || endHasLegacyCrimpWithoutStrip(state.destination);
    if (!stillLegacy) delete state.legacyCrimpWithoutStrip;
  }
  state.updatedAt = atIso;
  state.updatedBy = technicianId;
  state.revision = (state.revision || 0) + 1;
  state.overall = deriveOverall(state);
  return {
    state,
    changed: true,
    auditAction: clearedRework ? 'wire_stripped' : 'wire_stripped',
    clearedRework,
  };
}

/**
 * Atomic both-applicable-ends crimp COMPLETED + wireCrimp COMPLETED.
 * Requires wireStrip COMPLETED first (and per-end stripping COMPLETED).
 * Re-completing clears open crimping REWORK_REQUIRED without erasing original by/at.
 */
export function markWireCrimped(
  cable: CableStatusLike,
  technicianId: number,
  atIso: string = new Date().toISOString(),
): CrimpingMarkResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }
  if (state.wireStrip?.status !== 'COMPLETED') {
    const err: any = new Error('Wire must be stripped before crimping');
    err.code = 'STAGE_ORDER_VIOLATION';
    throw err;
  }
  const ends = applicablePrepEnds(state);
  const hasCrimpRework = ends.some((end) => state[end].crimpingStatus === 'REWORK_REQUIRED')
    || state.wireCrimp?.status === 'REWORK_REQUIRED';
  if (state.wireCrimp?.status === 'COMPLETED' && !hasCrimpRework) {
    return { state, changed: false, auditAction: null };
  }
  let clearedRework = false;
  for (const end of ends) {
    const side = state[end];
    if (side.crimpingStatus === 'REWORK_REQUIRED') {
      if (side.strippingStatus !== 'COMPLETED' && side.strippingStatus !== 'NOT_APPLICABLE') {
        throw new Error(strippingRequiredMessage(end));
      }
      clearedRework = true;
      side.crimpingStatus = 'COMPLETED';
      if (side.crimpedBy == null) side.crimpedBy = technicianId;
      if (!side.crimpedAt) side.crimpedAt = atIso;
    } else if (side.crimpingStatus !== 'COMPLETED') {
      if (side.strippingStatus !== 'COMPLETED' && side.strippingStatus !== 'NOT_APPLICABLE') {
        throw new Error(strippingRequiredMessage(end));
      }
      side.crimpingStatus = 'COMPLETED';
      side.crimpedBy = technicianId;
      side.crimpedAt = atIso;
    }
  }
  state.wireCrimp = { status: 'COMPLETED', by: state.wireCrimp?.by ?? technicianId, at: state.wireCrimp?.at ?? atIso };
  if (state.legacyPartial) {
    delete state.legacyPartial;
  }
  state.updatedAt = atIso;
  state.updatedBy = technicianId;
  state.revision = (state.revision || 0) + 1;
  state.overall = deriveOverall(state);
  return {
    state,
    changed: true,
    auditAction: 'wire_crimped',
    clearedRework,
  };
}

/**
 * Resolve legacyPartial flag. Clears legacyPartial; if both applicable ends
 * are preparation-complete, maps V2 stages to COMPLETED.
 */
export function resolveLegacyPartial(
  cable: CableStatusLike,
  actorId: number,
  atIso: string = new Date().toISOString(),
): CrimpingMarkResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.legacyPartial) {
    return { state, changed: false, auditAction: null };
  }
  delete state.legacyPartial;
  const ends = applicablePrepEnds(state);
  const allComplete = ends.every((e) => endPreparationComplete(state[e]));
  if (allComplete) {
    if (!state.cut || state.cut.status !== 'COMPLETED') {
      state.cut = { status: 'COMPLETED' };
    }
    if (!state.wireStrip || state.wireStrip.status !== 'COMPLETED') {
      state.wireStrip = { status: 'COMPLETED', by: actorId, at: atIso };
    }
    if (!state.wireCrimp || state.wireCrimp.status !== 'COMPLETED') {
      state.wireCrimp = { status: 'COMPLETED', by: actorId, at: atIso };
    }
  }
  state.updatedAt = atIso;
  state.updatedBy = actorId;
  state.revision = (state.revision || 0) + 1;
  state.overall = deriveOverall(state);
  return {
    state,
    changed: true,
    auditAction: 'legacy_partial_resolved',
  };
}

/**
 * Mark REWORK_REQUIRED on one end operation without deleting prior by/at evidence.
 * READY FOR WIRING becomes false via deriveOverall when overall !== COMPLETED.
 * Historical wiring (legacyWiringCompleted) is not rewritten.
 */
export function markPrepReworkRequired(
  cable: CableStatusLike,
  end: 'source' | 'destination',
  operation: CrimpingOperation,
  actorId: number,
  reason: string,
  atIso: string = new Date().toISOString(),
  role?: string,
): CrimpingMarkResult {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }
  const side = state[end];
  const statusKey = operation === 'strip' ? 'strippingStatus' : 'crimpingStatus';
  const current = side[statusKey];
  if (current === 'NOT_APPLICABLE') {
    throw new Error(`${end} end is not applicable for ${operation}`);
  }
  if (current === 'REWORK_REQUIRED') {
    return { state, changed: false, auditAction: null };
  }
  const previousStatus = current;
  side[statusKey] = 'REWORK_REQUIRED';
  side.reworkHistory = [
    ...(side.reworkHistory || []),
    {
      operation,
      previousStatus,
      reason: String(reason || '').trim() || 'Rework required',
      setBy: actorId,
      setAt: atIso,
      role,
    },
  ];
  state.updatedAt = atIso;
  state.updatedBy = actorId;
  state.revision = (state.revision || 0) + 1;
  state.overall = deriveOverall(state);
  return {
    state,
    changed: true,
    auditAction: null,
    previousStatus,
    newStatus: 'REWORK_REQUIRED',
  };
}

export type ReworkAffectedEnd = 'SOURCE' | 'DESTINATION' | 'BOTH' | 'GENERAL';

/**
 * Mark REWORK_REQUIRED with affected-end control.
 * SOURCE/DESTINATION: delegates to markPrepReworkRequired for one end.
 * BOTH: marks both applicable ends for the given operation.
 * GENERAL: marks overall wire-level rework (sets wireStrip/wireCrimp to REWORK_REQUIRED)
 *          without erasing prior per-end by/at attribution.
 */
export function markPrepReworkWithAffectedEnd(
  cable: CableStatusLike,
  affectedEnd: ReworkAffectedEnd,
  operation: CrimpingOperation,
  actorId: number,
  reason: string,
  atIso: string = new Date().toISOString(),
  role?: string,
): CrimpingMarkResult {
  if (affectedEnd === 'SOURCE' || affectedEnd === 'DESTINATION') {
    const end = affectedEnd === 'SOURCE' ? 'source' : 'destination';
    return markPrepReworkRequired(cable, end, operation, actorId, reason, atIso, role);
  }

  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (!state.required) {
    throw new Error('Wire is not Crimping Required');
  }

  if (affectedEnd === 'BOTH') {
    const ends = applicablePrepEnds(state);
    let changed = false;
    for (const end of ends) {
      const side = state[end];
      const statusKey = operation === 'strip' ? 'strippingStatus' : 'crimpingStatus';
      const current = side[statusKey];
      if (current === 'NOT_APPLICABLE' || current === 'REWORK_REQUIRED') continue;
      side[statusKey] = 'REWORK_REQUIRED';
      side.reworkHistory = [
        ...(side.reworkHistory || []),
        { operation, previousStatus: current, reason: String(reason || '').trim() || 'Rework required', setBy: actorId, setAt: atIso, role },
      ];
      changed = true;
    }
    if (!changed) return { state, changed: false, auditAction: null };
    state.updatedAt = atIso;
    state.updatedBy = actorId;
    state.revision = (state.revision || 0) + 1;
    state.overall = deriveOverall(state);
    return { state, changed: true, auditAction: null, newStatus: 'REWORK_REQUIRED' };
  }

  // GENERAL: wire-level rework — marks wireStrip/wireCrimp REWORK_REQUIRED
  const stageKey = operation === 'strip' ? 'wireStrip' : 'wireCrimp';
  if (state[stageKey]?.status === 'REWORK_REQUIRED') {
    return { state, changed: false, auditAction: null };
  }
  if (!state[stageKey]) {
    (state as any)[stageKey] = { status: 'REWORK_REQUIRED', by: undefined, at: undefined };
  } else {
    state[stageKey]!.status = 'REWORK_REQUIRED' as any;
  }
  state.updatedAt = atIso;
  state.updatedBy = actorId;
  state.revision = (state.revision || 0) + 1;
  state.overall = deriveOverall(state);
  return { state, changed: true, auditAction: null, newStatus: 'REWORK_REQUIRED' };
}

export function setCrimpingRequired(
  cable: CableStatusLike,
  required: boolean,
  actorId: number,
  atIso: string = new Date().toISOString(),
): CrimpingState {
  const openEnd = cable.openEnd ?? null;
  const state = normalizeCrimping(cable.crimping, openEnd);
  if (required && cable.src === true && cable.dst === true && !state.required) {
    state.legacyWiringCompleted = true;
  }
  state.required = required;
  state.updatedAt = atIso;
  state.updatedBy = actorId;
  state.revision = (state.revision || 0) + 1;
  const withEnds = applyOpenEndEligibility(state, openEnd);
  withEnds.overall = deriveOverall(withEnds);
  return withEnds;
}

export interface CrimpingKpiCounts {
  totalWires: number;
  required: number;
  completed: number;
  partial: number;
  pending: number;
  notRequired: number;
  rework: number;
  openSource: number;
  openDestination: number;
  sourceStripped: number;
  sourceCrimped: number;
  destinationStripped: number;
  destinationCrimped: number;
  /** @deprecated Prefer sourceCrimped — kept for older clients */
  sourceCompleted: number;
  /** @deprecated Prefer destinationCrimped */
  destinationCompleted: number;
  readyForWiring: number;
  /** Wire-completion % = preparation completed / required * 100 */
  percent: number;
  /** V2 wire-level: wires with cut COMPLETED */
  cut: number;
  /** V2 wire-level: wires with wireStrip COMPLETED */
  stripped: number;
  /** V2 wire-level: wires with wireCrimp COMPLETED */
  crimped: number;
  /** Wires flagged as legacy partial (one end done, no V2 stages) */
  legacyPartial: number;
  /** Wires with any REWORK_REQUIRED on strip/crimp operations */
  openRework: number;
  /** Wires with qaHold flag set */
  qaHold: number;
}

export function summarizeCrimpingKpis(
  cables: CableStatusLike[],
): CrimpingKpiCounts {
  let required = 0;
  let completed = 0;
  let partial = 0;
  let pending = 0;
  let notRequired = 0;
  let rework = 0;
  let openSource = 0;
  let openDestination = 0;
  let sourceStripped = 0;
  let sourceCrimped = 0;
  let destinationStripped = 0;
  let destinationCrimped = 0;
  let cutCount = 0;
  let strippedCount = 0;
  let crimpedCount = 0;
  let legacyPartialCount = 0;
  let openReworkCount = 0;
  let qaHoldCount = 0;
  let readyCount = 0;

  for (const cable of cables) {
    const open = cable?.openEnd ?? null;
    if (open === 'source' || open === 'both') openSource += 1;
    if (open === 'destination' || open === 'both') openDestination += 1;

    const state = normalizeCrimping(cable?.crimping, open);
    if (!state.required) {
      notRequired += 1;
      continue;
    }
    required += 1;
    if (state.source.strippingStatus === 'COMPLETED') sourceStripped += 1;
    if (state.source.crimpingStatus === 'COMPLETED') sourceCrimped += 1;
    if (state.destination.strippingStatus === 'COMPLETED') destinationStripped += 1;
    if (state.destination.crimpingStatus === 'COMPLETED') destinationCrimped += 1;
    const hasRework = state.overall === 'REWORK_REQUIRED'
      || state.source.crimpingStatus === 'REWORK_REQUIRED'
      || state.destination.crimpingStatus === 'REWORK_REQUIRED'
      || state.source.strippingStatus === 'REWORK_REQUIRED'
      || state.destination.strippingStatus === 'REWORK_REQUIRED';
    if (hasRework) {
      rework += 1;
      openReworkCount += 1;
    }
    if (state.overall === 'COMPLETED') completed += 1;
    else if (state.overall === 'PARTIAL') partial += 1;
    else pending += 1;

    // V2 wire-level KPIs
    if (state.cut?.status === 'COMPLETED') cutCount += 1;
    if (state.wireStrip?.status === 'COMPLETED') strippedCount += 1;
    if (state.wireCrimp?.status === 'COMPLETED') crimpedCount += 1;
    if (state.legacyPartial) legacyPartialCount += 1;
    if (state.qaHold) qaHoldCount += 1;
    if (isReadyForWiring(state)) readyCount += 1;
  }

  return {
    totalWires: cables.length,
    required,
    completed,
    partial,
    pending,
    notRequired,
    rework,
    openSource,
    openDestination,
    sourceStripped,
    sourceCrimped,
    destinationStripped,
    destinationCrimped,
    sourceCompleted: sourceCrimped,
    destinationCompleted: destinationCrimped,
    readyForWiring: readyCount,
    percent: crimpingWirePercent(completed, required),
    cut: cutCount,
    stripped: strippedCount,
    crimped: crimpedCount,
    legacyPartial: legacyPartialCount,
    openRework: openReworkCount,
    qaHold: qaHoldCount,
  };
}

/**
 * Sum assignment-level KPI objects into a portfolio roll-up.
 * Never invents totals — empty input yields zeroes. Percent recomputed from sums.
 */
export function aggregateCrimpingKpis(parts: CrimpingKpiCounts[]): CrimpingKpiCounts {
  const zero: CrimpingKpiCounts = {
    totalWires: 0,
    required: 0,
    completed: 0,
    partial: 0,
    pending: 0,
    notRequired: 0,
    rework: 0,
    openSource: 0,
    openDestination: 0,
    sourceStripped: 0,
    sourceCrimped: 0,
    destinationStripped: 0,
    destinationCrimped: 0,
    sourceCompleted: 0,
    destinationCompleted: 0,
    readyForWiring: 0,
    percent: 0,
    cut: 0,
    stripped: 0,
    crimped: 0,
    legacyPartial: 0,
    openRework: 0,
    qaHold: 0,
  };
  const out = { ...zero };
  for (const p of parts) {
    if (!p) continue;
    out.totalWires += p.totalWires || 0;
    out.required += p.required || 0;
    out.completed += p.completed || 0;
    out.partial += p.partial || 0;
    out.pending += p.pending || 0;
    out.notRequired += p.notRequired || 0;
    out.rework += p.rework || 0;
    out.openSource += p.openSource || 0;
    out.openDestination += p.openDestination || 0;
    out.sourceStripped += p.sourceStripped || 0;
    out.sourceCrimped += p.sourceCrimped || 0;
    out.destinationStripped += p.destinationStripped || 0;
    out.destinationCrimped += p.destinationCrimped || 0;
    out.sourceCompleted += p.sourceCompleted || 0;
    out.destinationCompleted += p.destinationCompleted || 0;
    out.readyForWiring += p.readyForWiring || 0;
    out.cut += p.cut || 0;
    out.stripped += p.stripped || 0;
    out.crimped += p.crimped || 0;
    out.legacyPartial += p.legacyPartial || 0;
    out.openRework += p.openRework || 0;
    out.qaHold += p.qaHold || 0;
  }
  out.percent = crimpingWirePercent(out.completed, out.required);
  return out;
}

/** Crimping progress uses Required as denominator — never total wires. */
export function crimpingWirePercent(completed: number, required: number): number {
  if (!required || required <= 0) return 0;
  const done = Math.max(0, Math.min(completed, required));
  return Math.round((done / required) * 1000) / 10;
}

/** Helper for nested complete end (tests / fixtures). */
export function completePrepEnd(
  strippedBy = 1,
  crimpedBy = 1,
  at = '2026-09-04T06:00:00.000Z',
): CrimpingEndState {
  return {
    strippingStatus: 'COMPLETED',
    crimpingStatus: 'COMPLETED',
    strippedBy,
    strippedAt: at,
    crimpedBy,
    crimpedAt: at,
  };
}

/** Wire DTO projection for APIs / report / group view. */
export function projectWirePrep(cable: CableStatusLike, cableIndex: number) {
  const crimping = normalizeCrimping(cable?.crimping, cable?.openEnd ?? null);
  return {
    cable_index: cableIndex,
    required: crimping.required,
    overall: crimping.overall,
    wiring_locked: isWiringLockedByCrimping({ ...cable, crimping }),
    readyForWiring: isReadyForWiring(crimping),
    openEnd: cable?.openEnd ?? null,
    wiring_src: Boolean(cable?.src),
    wiring_dst: Boolean(cable?.dst),
    legacyWiringCompleted: crimping.legacyWiringCompleted === true,
    legacyCrimpWithoutStrip: crimping.legacyCrimpWithoutStrip === true,
    legacyPartial: crimping.legacyPartial === true,
    qaHold: crimping.qaHold === true,
    cut: crimping.cut ?? null,
    wireStrip: crimping.wireStrip ?? null,
    wireCrimp: crimping.wireCrimp ?? null,
    source: {
      strippingStatus: crimping.source.strippingStatus,
      crimpingStatus: crimping.source.crimpingStatus,
      strippedBy: crimping.source.strippedBy ?? null,
      strippedAt: crimping.source.strippedAt ?? null,
      crimpedBy: crimping.source.crimpedBy ?? null,
      crimpedAt: crimping.source.crimpedAt ?? null,
    },
    destination: {
      strippingStatus: crimping.destination.strippingStatus,
      crimpingStatus: crimping.destination.crimpingStatus,
      strippedBy: crimping.destination.strippedBy ?? null,
      strippedAt: crimping.destination.strippedAt ?? null,
      crimpedBy: crimping.destination.crimpedBy ?? null,
      crimpedAt: crimping.destination.crimpedAt ?? null,
    },
    source_strip: crimping.source.strippingStatus,
    source_crimp: crimping.source.crimpingStatus,
    destination_strip: crimping.destination.strippingStatus,
    destination_crimp: crimping.destination.crimpingStatus,
    sourceBy: crimping.source.crimpedBy ?? null,
    destinationBy: crimping.destination.crimpedBy ?? null,
    sourceAt: crimping.source.crimpedAt ?? null,
    destinationAt: crimping.destination.crimpedAt ?? null,
  };
}
