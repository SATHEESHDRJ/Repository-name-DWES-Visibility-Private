import type { Cable, QcStatus } from '../../../types';
import {
  DEFAULT_CABLE_STATUS,
  cableSearchText,
  cableStatusChip,
  getCellValue,
  type ExtendedCableStatus,
} from '../../technician/wiring/wiring-utils';

export type StatusChipFilter = 'all' | 'pending' | 'progress' | 'done' | 'issue';

export interface FrameProgressAssignment {
  id: number;
  status: string;
  technician_name: string;
  technician_id: number;
  cables_total: number;
  cables_src_done: number;
  cables_dst_done: number;
  kpi: number;
  started_at: string | null;
  completed_at: string | null;
  review_status: string;
  report_submitted: boolean;
  rework_requested: boolean;
}

export interface MonitorAssignmentContext {
  id: number;
  status: string;
  technician_name: string;
  started_at: string | null;
  completed_at: string | null;
  review_status: string;
  qc_status: QcStatus;
  rework_requested: boolean;
  rework_reason?: string;
}

export interface MonitorSummary {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  verified: number;
  rework: number;
  overallPct: number;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export function pickActiveAssignment(
  assignments: FrameProgressAssignment[],
): FrameProgressAssignment | null {
  if (!assignments.length) return null;
  const priority = ['in_progress', 'assigned', 'paused', 'completed'];
  for (const status of priority) {
    const match = assignments.find(a => a.status === status);
    if (match) return match;
  }
  return assignments[0];
}

export function computeMonitorSummary(
  total: number,
  status: Record<string, ExtendedCableStatus>,
  assignment?: MonitorAssignmentContext | null,
): MonitorSummary {
  let completed = 0;
  let inProgress = 0;
  let pending = 0;
  let rework = 0;
  let verified = 0;

  for (let i = 0; i < total; i++) {
    const st = status[String(i)] ?? DEFAULT_CABLE_STATUS;
    if (st.issue) {
      rework += 1;
    } else if (st.src && st.dst) {
      completed += 1;
      verified += 1;
    } else if (st.src || st.dst) {
      inProgress += 1;
    } else {
      pending += 1;
    }
  }

  if (assignment?.qc_status === 'complete') {
    verified = completed;
  } else if (assignment?.qc_status === 'issues_found') {
    verified = Math.max(0, completed - rework);
  }

  let srcDone = 0;
  let dstDone = 0;
  for (let i = 0; i < total; i++) {
    const st = status[String(i)] ?? DEFAULT_CABLE_STATUS;
    if (st.src) srcDone += 1;
    if (st.dst) dstDone += 1;
  }
  const overallPct = total > 0 ? Math.round(((srcDone + dstDone) / (total * 2)) * 100) : 0;

  return { total, completed, inProgress, pending, verified, rework, overallPct };
}

export function statusMatchesFilter(
  st: ExtendedCableStatus,
  filter: StatusChipFilter,
): boolean {
  if (filter === 'all') return true;
  const chip = cableStatusChip(st);
  if (filter === 'issue') return chip.tone === 'issue';
  if (filter === 'done') return chip.tone === 'done';
  if (filter === 'progress') return chip.tone === 'progress';
  if (filter === 'pending') return chip.tone === 'pending';
  return true;
}

export function cableFacetValue(cable: Cable, facet: 'color' | 'size' | 'device'): string {
  if (facet === 'color') return (cable.color || '').trim();
  if (facet === 'size') return (cable.size || '').trim();
  const dev = [cable.source_device, cable.dest_device, cable.source, cable.destination]
    .map(v => String(v ?? '').trim())
    .filter(Boolean);
  return dev[0] || '';
}

export function filterCableIndices(
  cables: Cable[],
  status: Record<string, ExtendedCableStatus>,
  opts: {
    search: string;
    statusFilter: StatusChipFilter;
    colorFilter: Set<string>;
    sizeFilter: Set<string>;
    deviceFilter: Set<string>;
  },
): number[] {
  const q = opts.search.trim().toLowerCase();
  const indices: number[] = [];
  for (let i = 0; i < cables.length; i++) {
    const cable = cables[i];
    const st = status[String(i)] ?? DEFAULT_CABLE_STATUS;
    if (!statusMatchesFilter(st, opts.statusFilter)) continue;
    if (opts.colorFilter.size && !opts.colorFilter.has((cable.color || '').trim())) continue;
    if (opts.sizeFilter.size && !opts.sizeFilter.has((cable.size || '').trim())) continue;
    if (opts.deviceFilter.size) {
      const devs = new Set(
        [cable.source_device, cable.dest_device, cable.source, cable.destination]
          .map(v => String(v ?? '').trim())
          .filter(Boolean),
      );
      const hit = [...opts.deviceFilter].some(d => devs.has(d));
      if (!hit) continue;
    }
    if (q && !cableSearchText(cable).includes(q)) continue;
    indices.push(i);
  }
  return indices;
}

export function sortCableIndices(
  indices: number[],
  cables: Cable[],
  mapping: Record<string, string>,
  sort: SortState | null,
  status: Record<string, ExtendedCableStatus>,
): number[] {
  if (!sort) return indices;
  const mult = sort.dir === 'asc' ? 1 : -1;
  const sorted = [...indices];
  sorted.sort((a, b) => {
    let av = '';
    let bv = '';
    if (sort.key === '__status') {
      const as = cableStatusChip(status[String(a)] ?? DEFAULT_CABLE_STATUS).label;
      const bs = cableStatusChip(status[String(b)] ?? DEFAULT_CABLE_STATUS).label;
      return as.localeCompare(bs) * mult;
    }
    if (sort.key === '__idx') {
      return (a - b) * mult;
    }
    av = getCellValue(cables[a], sort.key, mapping);
    bv = getCellValue(cables[b], sort.key, mapping);
    const an = Number(av);
    const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '') {
      return (an - bn) * mult;
    }
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * mult;
  });
  return sorted;
}

export function uniqueFacetValues(
  cables: Cable[],
  facet: 'color' | 'size' | 'device',
): string[] {
  const set = new Set<string>();
  for (const cable of cables) {
    if (facet === 'device') {
      for (const v of [cable.source_device, cable.dest_device, cable.source, cable.destination]) {
        const t = String(v ?? '').trim();
        if (t) set.add(t);
      }
    } else {
      const v = cableFacetValue(cable, facet);
      if (v) set.add(v);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function formatMonitorTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
}

export function qaStatusLabel(qc: QcStatus | undefined, reviewStatus: string | undefined): string {
  if (qc === 'complete') return 'QA Verified';
  if (qc === 'issues_found') return 'QA Issues';
  if (reviewStatus === 'rework') return 'Rework';
  if (reviewStatus === 'approved') return 'Supervisor Approved';
  return 'Not Inspected';
}
