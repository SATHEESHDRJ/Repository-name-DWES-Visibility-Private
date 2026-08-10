/**
 * Pure aggregations for Director Monitoring (read-only).
 * Cable metrics are derived only from DWES assignment + cable_status records.
 */
import {
  parseCableStatus,
  type CableStatusEntry,
} from './cable-status.util';
import { countOpenEnds } from './director-submission.util';
import { wiringKpiPercent } from './kpi.constants';

export type OneSideBucket =
  | 'src_only'
  | 'dst_only'
  | 'both_done'
  | 'both_pending'
  | 'skipped';

export type AssignmentWorkStatus = 'not_started' | 'working' | 'paused' | 'completed';

export function mapAssignmentStatus(status: string | null | undefined): AssignmentWorkStatus {
  const s = String(status || '').toLowerCase();
  if (s === 'in_progress') return 'working';
  if (s === 'paused') return 'paused';
  if (s === 'completed') return 'completed';
  return 'not_started';
}

export function isSkippedCable(entry: CableStatusEntry | null | undefined): boolean {
  if (!entry) return false;
  const note = String(entry.note || '');
  return /\[SKIPPED\b/i.test(note);
}

export function isCorrectedCable(entry: CableStatusEntry | null | undefined): boolean {
  if (!entry) return false;
  if ((entry as { corrected?: boolean }).corrected === true) return true;
  return /\[CORRECTED\b/i.test(String(entry.note || ''));
}

export type CableRollup = {
  finished: number;
  remaining: number;
  skipped: number;
  corrections: number;
  src_only: number;
  dst_only: number;
  both_pending: number;
  both_done: number;
  open_source: number;
  open_destination: number;
  progress_pct: number;
};

export function rollupCableStatus(
  cableStatusRaw: string | Record<string, CableStatusEntry> | null | undefined,
  cablesTotal: number,
): CableRollup {
  const total = Math.max(0, Number(cablesTotal) || 0);
  const cs = parseCableStatus(cableStatusRaw);
  const opens = countOpenEnds(cs);

  let finished = 0;
  let skipped = 0;
  let corrections = 0;
  let src_only = 0;
  let dst_only = 0;
  let both_pending = 0;
  let both_done = 0;
  let srcDoneEnds = 0;
  let dstDoneEnds = 0;

  for (let i = 0; i < total; i++) {
    const st = cs[String(i)] || {};
    const src = !!st.src;
    const dst = !!st.dst;
    if (src) srcDoneEnds += 1;
    if (dst) dstDoneEnds += 1;
    if (isCorrectedCable(st)) corrections += 1;

    if (isSkippedCable(st)) {
      skipped += 1;
      continue;
    }
    if (src && dst) {
      finished += 1;
      both_done += 1;
    } else if (src && !dst) {
      src_only += 1;
    } else if (!src && dst) {
      dst_only += 1;
    } else {
      both_pending += 1;
    }
  }

  const remaining = Math.max(0, total - finished - skipped);
  return {
    finished,
    remaining,
    skipped,
    corrections,
    src_only,
    dst_only,
    both_pending,
    both_done,
    open_source: opens.openEndSource,
    open_destination: opens.openEndDestination,
    progress_pct: wiringKpiPercent(srcDoneEnds, dstDoneEnds, total),
  };
}

export function classifyCableBucket(entry: CableStatusEntry | null | undefined): OneSideBucket {
  if (isSkippedCable(entry)) return 'skipped';
  const src = !!entry?.src;
  const dst = !!entry?.dst;
  if (src && dst) return 'both_done';
  if (src && !dst) return 'src_only';
  if (!src && dst) return 'dst_only';
  return 'both_pending';
}

export type WireRefLookup = (cableIndex: number) => { sno: string | number | null; wire_ref: string };

export function buildOneSideRows(input: {
  project_code: string;
  panel_name: string;
  assignment_id: number;
  technician_name: string;
  panel_progress_pct: number;
  cables_total: number;
  cable_status: string | Record<string, CableStatusEntry> | null | undefined;
  wireRef?: WireRefLookup;
}): Array<{
  project_code: string;
  panel_name: string;
  assignment_id: number;
  wire_ref: string;
  sno: string | number | null;
  cable_index: number;
  bucket: OneSideBucket;
  technician_name: string;
  panel_progress_pct: number;
}> {
  const total = Math.max(0, Number(input.cables_total) || 0);
  const cs = parseCableStatus(input.cable_status);
  const rows: ReturnType<typeof buildOneSideRows> = [];
  for (let i = 0; i < total; i++) {
    const st = cs[String(i)] || {};
    const bucket = classifyCableBucket(st);
    // Report focuses on termination buckets + open-end intentional wires already in summary;
    // include all classified wires so the modal can filter by bucket.
    const lookup = input.wireRef?.(i) || { sno: i + 1, wire_ref: `Cable ${i + 1}` };
    rows.push({
      project_code: input.project_code,
      panel_name: input.panel_name,
      assignment_id: input.assignment_id,
      wire_ref: lookup.wire_ref,
      sno: lookup.sno,
      cable_index: i,
      bucket,
      technician_name: input.technician_name,
      panel_progress_pct: input.panel_progress_pct,
    });
  }
  return rows;
}

export function projectLifecycleBucket(projectState: string | null | undefined): 'not_started' | 'in_progress' | 'completed' {
  const s = String(projectState || '').toLowerCase();
  if (s === 'completed' || s === 'completed_by_tech') return 'completed';
  if (s === 'not_started' || s === '' || s === 'created') return 'not_started';
  // active, wiring_started, submitted_to_director, etc. → in progress
  return 'in_progress';
}
