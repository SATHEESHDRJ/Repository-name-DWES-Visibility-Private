import { useCallback, useEffect, useMemo, useState } from 'react';
import { techApi } from '../../../services/api';
import {
  formatReportCell,
  preparationGroupKey,
  summarizeCrimpingStatus,
  type ExtendedCableStatus,
} from './wiring-utils';
import type { Cable } from '../../../types';
import { onWorkflowChanged } from '../../../utils/dwesRefreshEvents';
import { useLiveConnection } from '../../../store/useLiveConnection';

type ReportFilter =
  | 'all'
  | 'all_required'
  | 'stripping_pending'
  | 'crimping_pending'
  | 'ready'
  | 'completed'
  | 'rework'
  | 'open_source'
  | 'open_destination'
  | 'current_group'
  | 'panel';

interface ReportCell {
  value: string | null;
  available: boolean;
  sourceField?: string;
}

interface StageAttr {
  status?: string;
  by?: number;
  at?: string;
  byName?: string | null;
  plannedLength?: string;
  actualLength?: string;
}

interface EndState {
  device: string;
  terminal: string;
  side: string;
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
}

interface ApiWireRow {
  cableIndex: number;
  wireId?: string;
  sno: string | number;
  ferrule: string;
  panel: string;
  groupKey: string;
  source: EndState;
  destination: EndState;
  wireColor: string;
  wireSize: string;
  length: string;
  openEnd: string | null;
  wiringSrc: boolean;
  wiringDst: boolean;
  crimpingRequired: boolean;
  overall: string;
  readyForWiring: boolean;
  finished?: boolean;
  qaHold?: boolean;
  cut?: StageAttr | null;
  wireStrip?: StageAttr | null;
  wireCrimp?: StageAttr | null;
}

interface Props {
  assignmentId: number;
  panelName: string;
  projectCode: string;
  technicianName?: string;
  cables: Cable[];
  status: Record<string, ExtendedCableStatus>;
  activeIndex: number;
  onSelectWire?: (index: number) => void;
}

function statusLabel(v: string | undefined): string {
  if (!v || v === 'NOT_STARTED') return 'PENDING';
  if (v === 'COMPLETED') return 'COMPLETE';
  if (v === 'NOT_APPLICABLE') return 'N/A';
  if (v === 'REWORK_REQUIRED') return 'REWORK';
  return v;
}

function actorLabel(name: string | null | undefined, id: number | undefined): string {
  if (name && name.trim()) return name.trim();
  if (id != null) return `User #${id}`;
  return '—';
}

function whenLabel(at: string | undefined): string {
  if (!at) return '—';
  try { return new Date(at).toLocaleString(); } catch { return at; }
}

/**
 * Complete global CRIMPING REPORT — one UI for every project/assignment.
 * Prefers backend getCrimpingReport projection; falls back to live client join.
 * Refreshes on SSE workflow events (polling fallback when stream is down).
 */
export default function TechnicianCrimpingReport({
  assignmentId,
  panelName,
  projectCode,
  technicianName,
  cables,
  status,
  activeIndex,
  onSelectWire,
}: Props) {
  const [apiReport, setApiReport] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportFilter>('all_required');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const liveConnected = useLiveConnection(state => state.connected);

  const fetchReport = useCallback(async () => {
    if (!assignmentId || assignmentId <= 0) {
      setApiReport(null);
      return;
    }
    try {
      const data = await techApi.crimpingReport(assignmentId);
      setApiReport(data);
      setLoadError(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setLoadError(typeof msg === 'string' ? msg : 'Could not load Crimping Report from API; showing live join.');
      setApiReport(null);
    }
  }, [assignmentId]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport, status]);

  // Live SSE: refresh report when this assignment/wire changes (no full-page reload).
  useEffect(() => {
    return onWorkflowChanged((detail) => {
      if (!assignmentId) return;
      if (detail.assignmentId != null && detail.assignmentId !== assignmentId) return;
      if (detail.projectCode && detail.projectCode !== projectCode) return;
      void fetchReport();
    });
  }, [assignmentId, projectCode, fetchReport]);

  // Polling fallback while SSE is disconnected.
  useEffect(() => {
    if (liveConnected || !assignmentId) return undefined;
    const timer = window.setInterval(() => { void fetchReport(); }, 12_000);
    return () => window.clearInterval(timer);
  }, [liveConnected, assignmentId, fetchReport]);

  const localKpi = useMemo(() => summarizeCrimpingStatus(cables, status), [cables, status]);
  const kpi = apiReport?.summary || localKpi;
  const meta = apiReport?.metadata;
  const currentGroup = useMemo(
    () => preparationGroupKey(cables[activeIndex] as Cable & { _raw?: Record<string, string> }),
    [cables, activeIndex],
  );

  const rows: ApiWireRow[] = useMemo(() => {
    if (apiReport?.wireRows?.length) return apiReport.wireRows as ApiWireRow[];
    return cables.map((c, i) => {
      const st = status[String(i)];
      const src = st?.crimping?.source;
      const dst = st?.crimping?.destination;
      const cell = (field: keyof Cable): ReportCell => {
        const v = c[field];
        if (v == null || String(v).trim() === '') return { value: null, available: false, sourceField: String(field) };
        return { value: String(v), available: true, sourceField: String(field) };
      };
      return {
        cableIndex: i,
        wireId: String(c.ref || c.sno || i + 1),
        sno: c.sno ?? i + 1,
        ferrule: c.ferrule || '',
        panel: c.panel || panelName,
        groupKey: preparationGroupKey(c as Cable & { _raw?: Record<string, string> }),
        source: {
          device: c.source_device || '',
          terminal: c.source_terminal || '',
          side: c.source || '',
          legNumber: cell('source_crimp_leg_number'),
          legSize: cell('source_crimp_leg_size'),
          legColor: cell('source_crimp_leg_color'),
          ferruleType: cell('source_ferrule_type'),
          ferruleMarking: cell('source_ferrule_marking'),
          strippingStatus: typeof src === 'object' ? String(src?.strippingStatus || 'NOT_STARTED') : 'NOT_STARTED',
          crimpingStatus: typeof src === 'object' ? String(src?.crimpingStatus || 'NOT_STARTED') : String(src || 'NOT_STARTED'),
        },
        destination: {
          device: c.dest_device || '',
          terminal: c.dest_terminal || '',
          side: c.destination || '',
          legNumber: cell('dest_crimp_leg_number'),
          legSize: cell('dest_crimp_leg_size'),
          legColor: cell('dest_crimp_leg_color'),
          ferruleType: cell('dest_ferrule_type'),
          ferruleMarking: cell('dest_ferrule_marking'),
          strippingStatus: typeof dst === 'object' ? String(dst?.strippingStatus || 'NOT_STARTED') : 'NOT_STARTED',
          crimpingStatus: typeof dst === 'object' ? String(dst?.crimpingStatus || 'NOT_STARTED') : String(dst || 'NOT_STARTED'),
        },
        wireColor: c.color || '',
        wireSize: c.size || '',
        length: c.length || '',
        openEnd: st?.openEnd ? String(st.openEnd) : null,
        wiringSrc: !!st?.src,
        wiringDst: !!st?.dst,
        crimpingRequired: !!st?.crimping?.required,
        overall: String(st?.crimping?.overall || 'NOT_REQUIRED'),
        readyForWiring: st?.crimping?.required ? st?.crimping?.overall === 'COMPLETED' : true,
        finished: st?.crimping?.overall === 'COMPLETED',
        qaHold: !!(st?.crimping as any)?.qaHold,
        cut: (st?.crimping as any)?.cut ?? null,
        wireStrip: (st?.crimping as any)?.wireStrip ?? null,
        wireCrimp: (st?.crimping as any)?.wireCrimp ?? null,
      };
    });
  }, [apiReport, cables, status, panelName]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === 'all' || filter === 'panel') return true;
      if (!row.crimpingRequired) {
        if (filter === 'all_required') return false;
      }
      const srcStrip = statusLabel(row.source.strippingStatus);
      const dstStrip = statusLabel(row.destination.strippingStatus);
      const srcCrimp = statusLabel(row.source.crimpingStatus);
      const dstCrimp = statusLabel(row.destination.crimpingStatus);
      const stripPending = srcStrip === 'PENDING' || dstStrip === 'PENDING';
      const crimpPending = srcCrimp === 'PENDING' || dstCrimp === 'PENDING';
      if (filter === 'all_required') return row.crimpingRequired;
      if (filter === 'completed') return row.overall === 'COMPLETED' || row.finished;
      if (filter === 'ready') return row.readyForWiring && row.crimpingRequired;
      if (filter === 'stripping_pending') return row.crimpingRequired && stripPending;
      if (filter === 'crimping_pending') return row.crimpingRequired && crimpPending;
      if (filter === 'rework') {
        return row.crimpingRequired && (
          row.overall === 'REWORK_REQUIRED'
          || row.qaHold
          || row.source.strippingStatus === 'REWORK_REQUIRED'
          || row.source.crimpingStatus === 'REWORK_REQUIRED'
          || row.destination.strippingStatus === 'REWORK_REQUIRED'
          || row.destination.crimpingStatus === 'REWORK_REQUIRED'
        );
      }
      if (filter === 'open_source') return row.openEnd === 'source' || row.openEnd === 'both';
      if (filter === 'open_destination') return row.openEnd === 'destination' || row.openEnd === 'both';
      if (filter === 'current_group') return row.crimpingRequired && row.groupKey === currentGroup;
      return true;
    });
  }, [rows, filter, currentGroup]);

  const displayProject = meta?.projectCode || projectCode;
  const displayPanel = meta?.panelName || panelName;
  const displayTech = meta?.technicianName || technicianName;
  const detail = detailIndex != null
    ? rows.find((r) => r.cableIndex === detailIndex) || null
    : null;

  return (
    <div className="prep-report" data-testid="crimping-report">
      <header className="prep-report__head">
        <h2 className="prep-report__title">CRIMPING / WIRE PREPARATION REPORT</h2>
        <p className="prep-report__meta">
          Project: {displayProject} · Panel: {displayPanel}
          {displayTech ? ` · Technician: ${displayTech}` : ''}
          {meta?.generatedAt ? ` · Generated: ${new Date(meta.generatedAt).toLocaleString()}` : ''}
          {` · Live: ${liveConnected ? 'SSE' : 'Polling'}`}
        </p>
        <p className="prep-report__note text-muted">
          Real-time preparation status via shared projection. Missing mapped leg fields show as NOT AVAILABLE
          (never inferred from wire size/color). Ferrule/Lug fitting is not a separate stage — legs are engineering metadata.
        </p>
        {loadError ? <p className="prep-report__note text-amber-600" role="status">{loadError}</p> : null}
      </header>

      <section className="prep-report__summary" aria-label="Crimping report summary">
        <div><span>Wires</span><strong>{kpi.totalWires ?? rows.length}</strong></div>
        <div><span>Required</span><strong>{kpi.required}</strong></div>
        <div><span>Cut</span><strong>{kpi.cut ?? '—'}</strong></div>
        <div><span>Stripped</span><strong>{kpi.stripped ?? '—'}</strong></div>
        <div><span>Crimped</span><strong>{kpi.crimped ?? '—'}</strong></div>
        <div><span>Ready for Wiring</span><strong>{kpi.readyForWiring}</strong></div>
        <div><span>Legacy Partial</span><strong>{kpi.legacyPartial ?? 0}</strong></div>
        <div><span>Rework / QA Hold</span><strong>{(kpi.openRework ?? kpi.rework ?? 0) + (kpi.qaHold ?? 0)}</strong></div>
        <div><span>Progress %</span><strong>{kpi.percent ?? kpi.progressPct ?? 0}</strong></div>
      </section>

      <div className="prep-report__filters" role="group" aria-label="Report filters">
        {([
          ['all_required', 'All Required'],
          ['all', 'All Wires'],
          ['current_group', 'Current Group'],
          ['panel', 'Current Panel'],
          ['stripping_pending', 'Pending'],
          ['rework', 'Rework'],
          ['ready', 'Ready'],
          ['completed', 'Finished'],
          ['open_source', 'Open Source'],
          ['open_destination', 'Open Destination'],
        ] as Array<[ReportFilter, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`prep-report__filter${filter === id ? ' is-active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="prep-report__table-wrap">
        <table className="prep-report__table prep-report__table--wide">
          <thead>
            <tr>
              <th>Wire</th>
              <th>Wire ID</th>
              <th>Cut</th>
              <th>Src Leg No</th>
              <th>Src Leg Size</th>
              <th>Src Leg Color</th>
              <th>Src Strip</th>
              <th>Src Crimp</th>
              <th>Dst Leg No</th>
              <th>Dst Leg Size</th>
              <th>Dst Leg Color</th>
              <th>Dst Strip</th>
              <th>Dst Crimp</th>
              <th>Ready</th>
              <th>Finished</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.wireId || row.cableIndex} data-wire-id={row.wireId}>
                <td>
                  {onSelectWire ? (
                    <button type="button" className="crimp-group-wire-link" onClick={() => onSelectWire(row.cableIndex)}>
                      {row.sno}
                    </button>
                  ) : (
                    row.sno
                  )}
                </td>
                <td>{row.wireId || '—'}</td>
                <td>{statusLabel(row.cut?.status)}</td>
                <td>{formatReportCell(row.source.legNumber)}</td>
                <td>{formatReportCell(row.source.legSize)}</td>
                <td>{formatReportCell(row.source.legColor)}</td>
                <td>{statusLabel(row.source.strippingStatus)}</td>
                <td>{statusLabel(row.source.crimpingStatus)}</td>
                <td>{formatReportCell(row.destination.legNumber)}</td>
                <td>{formatReportCell(row.destination.legSize)}</td>
                <td>{formatReportCell(row.destination.legColor)}</td>
                <td>{statusLabel(row.destination.strippingStatus)}</td>
                <td>{statusLabel(row.destination.crimpingStatus)}</td>
                <td>{row.readyForWiring ? 'YES' : 'NO'}</td>
                <td>{row.finished || row.overall === 'COMPLETED' ? 'YES' : 'NO'}</td>
                <td>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setDetailIndex(row.cableIndex)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={16} className="text-muted">No wires match this filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="prep-report__detail mt-4 border border-[var(--t-border,#E2E8F0)] rounded-lg p-3" data-testid="crimping-report-detail">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold text-[14px]">
              Wire {detail.sno} · ID {detail.wireId || '—'} — Preparation Detail
            </h3>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDetailIndex(null)}>Close</button>
          </div>
          <p className="text-[12px] text-muted mt-1">
            Cut: {statusLabel(detail.cut?.status)} by {actorLabel(detail.cut?.byName, detail.cut?.by)} at {whenLabel(detail.cut?.at)}
            {' · '}Strip (wire): {statusLabel(detail.wireStrip?.status)} by {actorLabel(detail.wireStrip?.byName, detail.wireStrip?.by)} at {whenLabel(detail.wireStrip?.at)}
            {' · '}Crimp (wire): {statusLabel(detail.wireCrimp?.status)} by {actorLabel(detail.wireCrimp?.byName, detail.wireCrimp?.by)} at {whenLabel(detail.wireCrimp?.at)}
          </p>
          <p className="text-[12px] mt-1">
            Ready: {detail.readyForWiring ? 'YES' : 'NO'} · Finished: {detail.finished || detail.overall === 'COMPLETED' ? 'YES' : 'NO'}
            {detail.qaHold ? ' · QA HOLD' : ''}
            {detail.overall === 'REWORK_REQUIRED' ? ' · REWORK' : ''}
          </p>
          {(['source', 'destination'] as const).map((end) => {
            const e = detail[end];
            return (
              <section key={end} className="mt-3 text-[13px]">
                <h4 className="font-semibold">{end === 'source' ? 'SOURCE' : 'DESTINATION'}</h4>
                <p>Device: {e.device || '—'} · Terminal: {e.terminal || '—'}</p>
                <p>
                  Leg No: {formatReportCell(e.legNumber)} · Size: {formatReportCell(e.legSize)} · Color: {formatReportCell(e.legColor)}
                </p>
                <p>
                  Strip: {statusLabel(e.strippingStatus)} by {actorLabel(e.strippedByName, e.strippedBy)} at {whenLabel(e.strippedAt)}
                </p>
                <p>
                  Crimp: {statusLabel(e.crimpingStatus)} by {actorLabel(e.crimpedByName, e.crimpedBy)} at {whenLabel(e.crimpedAt)}
                </p>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
