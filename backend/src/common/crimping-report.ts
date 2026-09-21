/**
 * Global Crimping Report projection — one reusable builder for every
 * project / panel / assignment / technician. Never invents leg data from
 * wire size/color. Missing mapped engineering values → available:false.
 */

import type { Cable } from '../data/mock-store';
import {
  normalizeCrimping,
  projectWirePrep,
  summarizeCrimpingKpis,
  type CableStatusLike,
  type CrimpingEndState,
  type CrimpingKpiCounts,
} from './crimping';

export type CrimpingReportReworkEntry = NonNullable<CrimpingEndState['reworkHistory']>[number];

export type ReportCell = {
  value: string | null;
  available: boolean;
  sourceField?: string;
};

export const CRIMP_LEG_FIELD_KEYS = [
  'source_crimp_leg_number',
  'source_crimp_leg_size',
  'source_crimp_leg_color',
  'source_ferrule_type',
  'source_ferrule_marking',
  'dest_crimp_leg_number',
  'dest_crimp_leg_size',
  'dest_crimp_leg_color',
  'dest_ferrule_type',
  'dest_ferrule_marking',
] as const;

export type CrimpLegFieldKey = (typeof CRIMP_LEG_FIELD_KEYS)[number];

/** Build a report cell from an optional mapped Cable field — never fall back to wire.size/color. */
export function reportCell(
  cable: Cable | null | undefined,
  field: string,
): ReportCell {
  if (!cable) return { value: null, available: false, sourceField: field };
  const raw = (cable as unknown as Record<string, unknown>)[field];
  if (raw == null) return { value: null, available: false, sourceField: field };
  const text = String(raw).trim();
  if (!text) return { value: null, available: false, sourceField: field };
  return { value: text, available: true, sourceField: field };
}

export function fieldAvailability(cables: Cable[]): Record<CrimpLegFieldKey, boolean> {
  const out = {} as Record<CrimpLegFieldKey, boolean>;
  for (const key of CRIMP_LEG_FIELD_KEYS) {
    out[key] = cables.some(c => reportCell(c, key).available);
  }
  return out;
}

export type CrimpingReportStageAttribution = {
  status: string;
  plannedLength?: string;
  actualLength?: string;
  by?: number;
  at?: string;
  byName?: string | null;
};

export type CrimpingReportEndProjection = {
  device: string;
  terminal: string;
  side: string;
  ferrule: string;
  legNumber: ReportCell;
  legSize: ReportCell;
  legColor: ReportCell;
  ferruleType: ReportCell;
  ferruleMarking: ReportCell;
  strippingStatus: string;
  crimpingStatus: string;
  strippedBy?: number;
  strippedAt?: string;
  strippedByName?: string | null;
  crimpedBy?: number;
  crimpedAt?: string;
  crimpedByName?: string | null;
  reworkHistory?: CrimpingReportReworkEntry[];
};

export interface CrimpingReportWireRow {
  cableIndex: number;
  /** Permanent wire identity (record_id → ref → sno → 1-based index). Never invents leg metadata. */
  wireId: string;
  /** Display wire number (schedule sno). */
  sno: string | number;
  ferrule: string;
  panel: string;
  groupKey: string;
  source: CrimpingReportEndProjection;
  destination: CrimpingReportEndProjection;
  wireColor: string;
  wireSize: string;
  length: string;
  openEnd: string | null;
  wiringSrc: boolean;
  wiringDst: boolean;
  crimpingRequired: boolean;
  overall: string;
  readyForWiring: boolean;
  /** Preparation finished (overall COMPLETED). */
  finished: boolean;
  /** QA hold blocks readiness. */
  qaHold: boolean;
  /** V2 Whole-Wire Preparation: cut stage with attribution. */
  cut?: CrimpingReportStageAttribution | null;
  /** V2 Whole-Wire Preparation: wire-level strip (both applicable ends). */
  wireStrip?: CrimpingReportStageAttribution | null;
  /** V2 Whole-Wire Preparation: wire-level crimp (both applicable ends). */
  wireCrimp?: CrimpingReportStageAttribution | null;
  /** Legacy partial flag. */
  legacyPartial?: boolean;
  /** First successful preparer (prefer earliest strip/crimp by). */
  preparedBy?: number;
  preparedByName?: string | null;
  preparedAt?: string;
  reworkCount?: number;
  latestReworkReason?: string | null;
  /**
   * Immutable prep/wiring audit trail for this wire (canonical + raw actions).
   * Never invented from FINISHED — only persisted technician/audit events.
   */
  auditHistory?: Array<{
    event_type: string;
    timestamp: string;
    technician_id?: number | null;
    technician_name?: string | null;
    remarks?: string | null;
  }>;
}

export interface CrimpingReportProjection {
  metadata: {
    assignmentId: number;
    projectCode: string;
    frameId: string;
    panelName: string;
    technicianId: number | null;
    technicianName: string | null;
    generatedAt: string;
    /** Ferrule/Lug Fitted is NOT a separate execution stage — legs are engineering metadata only. */
    ferruleLugFittedIsSeparateStage: false;
  };
  summary: CrimpingKpiCounts;
  wireRows: CrimpingReportWireRow[];
  fieldAvailability: Record<CrimpLegFieldKey, boolean>;
  /** Resolved actor id → display name for report cells. */
  actorNames: Record<string, string>;
}

/** Permanent wire_id for projection / SSE — never derives leg number/size/colour. */
export function resolvePermanentWireId(
  cable: Cable | null | undefined,
  cableIndex: number,
): string {
  if (!cable) return String(cableIndex + 1);
  const recordId = String(cable.record_id || '').trim();
  if (recordId) return recordId;
  const ref = String(cable.ref || '').trim();
  if (ref) return ref;
  const sno = String(cable.sno ?? '').trim();
  if (sno) return sno;
  return String(cableIndex + 1);
}

function actorName(
  names: Record<string, string> | undefined,
  id: number | undefined | null,
): string | null {
  if (id == null) return null;
  const label = names?.[String(id)];
  return label && label.trim() ? label.trim() : null;
}

function stageAttribution(
  stage: { status?: string; plannedLength?: string; actualLength?: string; by?: number; at?: string } | null | undefined,
  names?: Record<string, string>,
): CrimpingReportStageAttribution | null {
  if (!stage) return null;
  return {
    status: String(stage.status || 'NOT_STARTED'),
    ...(stage.plannedLength ? { plannedLength: stage.plannedLength } : {}),
    ...(stage.actualLength ? { actualLength: stage.actualLength } : {}),
    ...(stage.by != null ? { by: stage.by } : {}),
    ...(stage.at ? { at: stage.at } : {}),
    byName: actorName(names, stage.by),
  };
}

function pickPreparedAttribution(prep: ReturnType<typeof normalizeCrimping>): {
  preparedBy?: number;
  preparedAt?: string;
  reworkCount: number;
  latestReworkReason: string | null;
} {
  const hist = [
    ...(prep.source.reworkHistory || []),
    ...(prep.destination.reworkHistory || []),
  ];
  const reworkCount = hist.filter((h) => !/Re-prepared/i.test(String(h.reason || ''))).length;
  const latest = [...hist].sort((a, b) => String(b.setAt || '').localeCompare(String(a.setAt || '')))[0];
  const candidates: Array<{ by?: number; at?: string }> = [
    { by: prep.source.strippedBy, at: prep.source.strippedAt },
    { by: prep.source.crimpedBy, at: prep.source.crimpedAt },
    { by: prep.destination.strippedBy, at: prep.destination.strippedAt },
    { by: prep.destination.crimpedBy, at: prep.destination.crimpedAt },
  ].filter((c) => c.by != null && c.at);
  candidates.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const first = candidates[0];
  return {
    preparedBy: first?.by,
    preparedAt: first?.at,
    reworkCount,
    latestReworkReason: latest && !/Re-prepared/i.test(String(latest.reason || ''))
      ? String(latest.reason)
      : (latest ? String(latest.reason) : null),
  };
}

function equipmentGroupKey(cable: Cable | null | undefined): string {
  if (!cable) return 'UNGROUPED';
  const src = String(cable.source_device || cable.source || '').trim() || '—';
  const dst = String(cable.dest_device || cable.destination || '').trim() || '—';
  return `${src} → ${dst}`;
}

/**
 * Pure projection: join schedule cables[i] + cable_status[i] for one assignment.
 * Caller enforces RBAC (technician ownership / manager role).
 */
export function getCrimpingReport(input: {
  assignmentId: number;
  projectCode: string;
  frameId: string;
  panelName: string;
  technicianId?: number | null;
  technicianName?: string | null;
  scheduleCables: Cable[];
  cableStatuses: CableStatusLike[];
  generatedAt?: string;
  /** Optional map of user id → display name for completed-by cells. */
  actorNames?: Record<string, string>;
  /**
   * Optional immutable audit rows scoped to this assignment/panel.
   * Attached to wire rows by permanent wire_id / 1-based cable number in details.
   */
  auditEvents?: Array<{
    action: string;
    details?: string | null;
    technician_id?: number | null;
    technician_name?: string | null;
    created_at?: Date | string | null;
  }>;
}): CrimpingReportProjection {
  const schedule = Array.isArray(input.scheduleCables) ? input.scheduleCables : [];
  const statuses = Array.isArray(input.cableStatuses) ? input.cableStatuses : [];
  const names = input.actorNames || {};
  const n = Math.max(schedule.length, statuses.length);
  const aligned: CableStatusLike[] = [];
  for (let i = 0; i < n; i++) {
    aligned.push(statuses[i] || { src: false, dst: false });
  }
  const summary = summarizeCrimpingKpis(aligned);
  const wireRows: CrimpingReportWireRow[] = [];
  const audits = Array.isArray(input.auditEvents) ? input.auditEvents : [];

  const auditsForWire = (wireId: string, cableIndex: number) => {
    const cableNum = cableIndex + 1;
    const wireRe = new RegExp(`\\b(?:wire[_\\s-]?id|wire)\\s*[:=]?\\s*${wireId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const cableRe = new RegExp(`\\bCable\\s+${cableNum}\\b`, 'i');
    return audits
      .filter((ev) => {
        const details = String(ev.details || '');
        return wireRe.test(details) || cableRe.test(details);
      })
      .map((ev) => ({
        event_type: String(ev.action || ''),
        timestamp: ev.created_at
          ? (ev.created_at instanceof Date ? ev.created_at.toISOString() : String(ev.created_at))
          : '',
        technician_id: ev.technician_id ?? null,
        technician_name: ev.technician_name ?? null,
        remarks: ev.details ? String(ev.details) : null,
      }));
  };

  for (let i = 0; i < n; i++) {
    const cable = schedule[i] || ({} as Cable);
    const st = aligned[i];
    const prep = normalizeCrimping(st.crimping, st.openEnd ?? null);
    const projected = projectWirePrep(st, i);
    const attribution = pickPreparedAttribution(prep);
    const wireId = resolvePermanentWireId(cable, i);
    const auditHistory = auditsForWire(wireId, i);
    wireRows.push({
      cableIndex: i,
      wireId,
      sno: cable.sno ?? i + 1,
      ferrule: String(cable.ferrule || ''),
      panel: String(cable.panel || input.panelName || ''),
      groupKey: equipmentGroupKey(cable),
      source: {
        device: String(cable.source_device || ''),
        terminal: String(cable.source_terminal || ''),
        side: String(cable.source || ''),
        ferrule: String(cable.ferrule || ''),
        legNumber: reportCell(cable, 'source_crimp_leg_number'),
        legSize: reportCell(cable, 'source_crimp_leg_size'),
        legColor: reportCell(cable, 'source_crimp_leg_color'),
        ferruleType: reportCell(cable, 'source_ferrule_type'),
        ferruleMarking: reportCell(cable, 'source_ferrule_marking'),
        strippingStatus: projected.source.strippingStatus,
        crimpingStatus: projected.source.crimpingStatus,
        strippedBy: projected.source.strippedBy ?? undefined,
        strippedAt: projected.source.strippedAt ?? undefined,
        strippedByName: actorName(names, projected.source.strippedBy),
        crimpedBy: projected.source.crimpedBy ?? undefined,
        crimpedAt: projected.source.crimpedAt ?? undefined,
        crimpedByName: actorName(names, projected.source.crimpedBy),
        ...(prep.source.reworkHistory?.length
          ? { reworkHistory: prep.source.reworkHistory }
          : {}),
      },
      destination: {
        device: String(cable.dest_device || ''),
        terminal: String(cable.dest_terminal || ''),
        side: String(cable.destination || ''),
        ferrule: String(cable.ferrule || ''),
        legNumber: reportCell(cable, 'dest_crimp_leg_number'),
        legSize: reportCell(cable, 'dest_crimp_leg_size'),
        legColor: reportCell(cable, 'dest_crimp_leg_color'),
        ferruleType: reportCell(cable, 'dest_ferrule_type'),
        ferruleMarking: reportCell(cable, 'dest_ferrule_marking'),
        strippingStatus: projected.destination.strippingStatus,
        crimpingStatus: projected.destination.crimpingStatus,
        strippedBy: projected.destination.strippedBy ?? undefined,
        strippedAt: projected.destination.strippedAt ?? undefined,
        strippedByName: actorName(names, projected.destination.strippedBy),
        crimpedBy: projected.destination.crimpedBy ?? undefined,
        crimpedAt: projected.destination.crimpedAt ?? undefined,
        crimpedByName: actorName(names, projected.destination.crimpedBy),
        ...(prep.destination.reworkHistory?.length
          ? { reworkHistory: prep.destination.reworkHistory }
          : {}),
      },
      wireColor: String(cable.color || ''),
      wireSize: String(cable.size || ''),
      length: String(cable.length || ''),
      openEnd: st.openEnd ? String(st.openEnd) : null,
      wiringSrc: !!st.src,
      wiringDst: !!st.dst,
      crimpingRequired: prep.required,
      overall: prep.overall,
      readyForWiring: projected.readyForWiring,
      finished: prep.overall === 'COMPLETED',
      qaHold: prep.qaHold === true,
      cut: stageAttribution(prep.cut, names),
      wireStrip: stageAttribution(prep.wireStrip, names),
      wireCrimp: stageAttribution(prep.wireCrimp, names),
      legacyPartial: prep.legacyPartial === true ? true : undefined,
      ...attribution,
      preparedByName: actorName(names, attribution.preparedBy),
      ...(auditHistory.length ? { auditHistory } : {}),
    });
  }

  return {
    metadata: {
      assignmentId: input.assignmentId,
      projectCode: input.projectCode,
      frameId: input.frameId,
      panelName: input.panelName,
      technicianId: input.technicianId ?? null,
      technicianName: input.technicianName ?? null,
      generatedAt: input.generatedAt || new Date().toISOString(),
      ferruleLugFittedIsSeparateStage: false,
    },
    summary,
    wireRows,
    fieldAvailability: fieldAvailability(schedule),
    actorNames: names,
  };
}
