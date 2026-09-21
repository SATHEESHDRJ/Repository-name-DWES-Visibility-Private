import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { DwesLoadingIndicator } from '../ui/DwesLoadingIndicator';
import { supervisorApi } from '../../services/api';
import { formatReportCell } from '../technician/wiring/wiring-utils';
import { onWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { useLiveConnection } from '../../store/useLiveConnection';
import CrimpingRequiredModal from './CrimpingRequiredModal';

type DataFilter =
  | 'all'
  | 'required'
  | 'not_started'
  | 'stripping_pending'
  | 'crimping_pending'
  | 'partial'
  | 'complete'
  | 'ready'
  | 'not_ready'
  | 'rework'
  | 'open_source'
  | 'open_destination';

type ReworkOp = 'strip' | 'crimp';
type ReworkEnd = 'source' | 'destination';

interface ReportCell {
  value: string | null;
  available: boolean;
}

interface ReworkHistoryEntry {
  operation: ReworkOp;
  previousStatus: string;
  reason: string;
  setBy: number;
  setAt: string;
  role?: string;
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
  reworkHistory?: ReworkHistoryEntry[];
}

interface WireRow {
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
  projectCode: string;
  panelName: string;
  technicianName?: string;
  onClose?: () => void;
  embedded?: boolean;
  /** Supervisor can set Crimping Required; QA should pass false. */
  allowSetRequired?: boolean;
}

const FILTERS: Array<[DataFilter, string]> = [
  ['all', 'All'],
  ['required', 'Crimping Required'],
  ['not_started', 'Not Started'],
  ['stripping_pending', 'Stripping Pending'],
  ['crimping_pending', 'Crimping Pending'],
  ['partial', 'Partial'],
  ['complete', 'Complete'],
  ['ready', 'Ready For Wiring'],
  ['not_ready', 'Not Ready'],
  ['rework', 'Rework'],
  ['open_source', 'Open Source'],
  ['open_destination', 'Open Destination'],
];

function stLabel(v: string | undefined): string {
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

function wiringLabel(row: WireRow): string {
  if (row.wiringSrc && row.wiringDst) return 'COMPLETE';
  if (row.wiringSrc || row.wiringDst) return 'PARTIAL';
  return 'PENDING';
}

function matchesSearch(row: WireRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.sno, row.wireId, row.ferrule, row.source.device, row.source.terminal, row.source.side,
    row.destination.device, row.destination.terminal, row.destination.side, row.groupKey,
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

function hasRework(row: WireRow): boolean {
  return row.overall === 'REWORK_REQUIRED'
    || !!row.qaHold
    || row.source.strippingStatus === 'REWORK_REQUIRED'
    || row.source.crimpingStatus === 'REWORK_REQUIRED'
    || row.destination.strippingStatus === 'REWORK_REQUIRED'
    || row.destination.crimpingStatus === 'REWORK_REQUIRED';
}

function matchesFilter(row: WireRow, filter: DataFilter): boolean {
  const srcStrip = stLabel(row.source.strippingStatus);
  const dstStrip = stLabel(row.destination.strippingStatus);
  const srcCrimp = stLabel(row.source.crimpingStatus);
  const dstCrimp = stLabel(row.destination.crimpingStatus);
  const stripPending = srcStrip === 'PENDING' || dstStrip === 'PENDING';
  const crimpPending = srcCrimp === 'PENDING' || dstCrimp === 'PENDING';
  switch (filter) {
    case 'all': return true;
    case 'required': return row.crimpingRequired;
    case 'not_started': return row.crimpingRequired && row.overall === 'NOT_STARTED';
    case 'stripping_pending': return row.crimpingRequired && stripPending;
    case 'crimping_pending': return row.crimpingRequired && crimpPending;
    case 'partial': return row.overall === 'PARTIAL';
    case 'complete': return row.overall === 'COMPLETED' || !!row.finished;
    case 'ready': return row.crimpingRequired && row.readyForWiring;
    case 'not_ready': return row.crimpingRequired && !row.readyForWiring;
    case 'rework': return row.crimpingRequired && hasRework(row);
    case 'open_source': return row.openEnd === 'source' || row.openEnd === 'both';
    case 'open_destination': return row.openEnd === 'destination' || row.openEnd === 'both';
    default: return true;
  }
}

function canMarkRework(status: string | undefined): boolean {
  return Boolean(status) && status !== 'NOT_APPLICABLE' && status !== 'REWORK_REQUIRED';
}

/**
 * Supervisor Crimping Data View — panel-level table + drill-down.
 * Consumes the same global getCrimpingReport projection (manager API).
 * Silent live refresh via SSE workflow events (12s poll when disconnected).
 */
export default function SupervisorCrimpingDataView({
  assignmentId,
  projectCode,
  panelName,
  technicianName,
  onClose,
  embedded = false,
  allowSetRequired = true,
}: Props) {
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DataFilter>('required');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<WireRow | null>(null);
  const [showRequiredModal, setShowRequiredModal] = useState(false);
  const [reworkEnd, setReworkEnd] = useState<ReworkEnd | null>(null);
  const [reworkOp, setReworkOp] = useState<ReworkOp>('strip');
  const [reworkReason, setReworkReason] = useState('');
  const [reworkBusy, setReworkBusy] = useState(false);
  const [reworkError, setReworkError] = useState<string | null>(null);
  const liveConnected = useLiveConnection(state => state.connected);

  const load = useCallback(async (keepDetailIndex?: number | null, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await supervisorApi.crimpingReport(assignmentId);
      setReport(data);
      if (!silent) setError(null);
      if (keepDetailIndex != null && Array.isArray(data?.wireRows)) {
        const next = data.wireRows.find((r: WireRow) => r.cableIndex === keepDetailIndex) || null;
        setDetail(next);
      } else if (silent) {
        setDetail((prev) => {
          if (!prev || !Array.isArray(data?.wireRows)) return prev;
          return data.wireRows.find((r: WireRow) => r.cableIndex === prev.cableIndex) || prev;
        });
      }
    } catch (err: any) {
      if (silent) return;
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      setError(
        status === 403 || status === 401
          ? (typeof msg === 'string' ? msg : 'Not authorized for this assignment.')
          : (typeof msg === 'string' ? msg : 'Could not load Crimping Data.'),
      );
      setReport(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => { void load(); }, [load]);

  // Live SSE: refresh silently when this assignment/wire changes.
  useEffect(() => {
    return onWorkflowChanged((evt) => {
      if (!assignmentId) return;
      if (evt.assignmentId != null && evt.assignmentId !== assignmentId) return;
      if (evt.projectCode && evt.projectCode !== projectCode) return;
      void load(null, true);
    });
  }, [assignmentId, projectCode, load]);

  // Polling fallback while SSE is disconnected.
  useEffect(() => {
    if (liveConnected || !assignmentId) return undefined;
    const timer = window.setInterval(() => {
      void load(null, true);
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [liveConnected, assignmentId, load]);

  const rows: WireRow[] = useMemo(
    () => (Array.isArray(report?.wireRows) ? report.wireRows : []),
    [report],
  );
  const kpi = report?.summary;
  const techLabel = report?.metadata?.technicianName || technicianName || '—';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => matchesFilter(r, filter) && matchesSearch(r, q));
  }, [rows, filter, search]);

  const openReworkForm = (end: ReworkEnd, op: ReworkOp) => {
    setReworkEnd(end);
    setReworkOp(op);
    setReworkReason('');
    setReworkError(null);
  };

  const submitRework = async () => {
    if (!detail || !reworkEnd) return;
    const reason = reworkReason.trim();
    if (!reason) {
      setReworkError('Reason is required.');
      return;
    }
    setReworkBusy(true);
    setReworkError(null);
    try {
      await supervisorApi.setCrimpingRework(
        assignmentId,
        detail.cableIndex,
        reworkEnd,
        reworkOp,
        reason,
      );
      setReworkEnd(null);
      setReworkReason('');
      await load(detail.cableIndex);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setReworkError(typeof msg === 'string' ? msg : 'Could not mark rework.');
    } finally {
      setReworkBusy(false);
    }
  };

  const body = (
    <div className="sup-crimp-data" data-testid="supervisor-crimping-data">
      <header className="sup-crimp-data__head">
        <div>
          <h2 className="sup-crimp-data__title">Crimping Data</h2>
          <p className="sup-crimp-data__meta text-muted">
            Project: {projectCode} · Panel: {panelName} · Technician: {techLabel}
            {` · Live: ${liveConnected ? 'SSE' : 'Polling'}`}
          </p>
          <p className="text-muted text-[12px] mt-1">
            Missing mapped leg fields show as NOT AVAILABLE (never inferred from wire size/color).
            Ferrule/Lug fitting is not a separate stage — legs are engineering metadata.
          </p>
        </div>
        <div className="sup-crimp-data__actions">
          {allowSetRequired ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setShowRequiredModal(true)}>
              Crimping Required
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={async () => {
              try {
                const blob = await supervisorApi.crimpingReportPdf(assignmentId);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `crimping-report-${assignmentId}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                setError('PDF download failed.');
              }
            }}
          >
            Download PDF
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => { void load(detail?.cableIndex); }} disabled={loading}>
            Refresh
          </button>
          {onClose ? (
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Close</button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="p-6"><DwesLoadingIndicator label="Loading Crimping Data…" size="sm" /></div>
      ) : error ? (
        <p className="text-red-600 p-4" role="alert">{error}</p>
      ) : (
        <>
          <section className="prep-report__summary" aria-label="Crimping data summary">
            <div><span>Wires</span><strong>{kpi?.totalWires ?? rows.length}</strong></div>
            <div><span>Required</span><strong>{kpi?.required ?? 0}</strong></div>
            <div><span>Cut</span><strong>{kpi?.cut ?? '—'}</strong></div>
            <div><span>Stripped</span><strong>{kpi?.stripped ?? '—'}</strong></div>
            <div><span>Crimped</span><strong>{kpi?.crimped ?? '—'}</strong></div>
            <div><span>Ready</span><strong>{kpi?.readyForWiring ?? 0}</strong></div>
            <div><span>Rework/QA</span><strong>{(kpi?.openRework ?? kpi?.rework ?? 0) + (kpi?.qaHold ?? 0)}</strong></div>
            <div><span>Progress %</span><strong>{kpi?.percent ?? kpi?.progressPct ?? 0}</strong></div>
          </section>

          <div className="sup-crimp-data__toolbar">
            <input
              type="search"
              className="sup-crimp-data__search"
              placeholder="Search wire / equipment / terminal / ref"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search Crimping Data"
            />
            <div className="sup-crimp-data__filters" role="group" aria-label="Crimping data filters">
              {FILTERS.map(([id, label]) => (
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
                    <td>{row.sno}</td>
                    <td>{row.wireId || '—'}</td>
                    <td>{stLabel(row.cut?.status)}</td>
                    <td>{formatReportCell(row.source.legNumber)}</td>
                    <td>{formatReportCell(row.source.legSize)}</td>
                    <td>{formatReportCell(row.source.legColor)}</td>
                    <td>{stLabel(row.source.strippingStatus)}</td>
                    <td>{stLabel(row.source.crimpingStatus)}</td>
                    <td>{formatReportCell(row.destination.legNumber)}</td>
                    <td>{formatReportCell(row.destination.legSize)}</td>
                    <td>{formatReportCell(row.destination.legColor)}</td>
                    <td>{stLabel(row.destination.strippingStatus)}</td>
                    <td>{stLabel(row.destination.crimpingStatus)}</td>
                    <td>{row.readyForWiring ? 'YES' : 'NO'}</td>
                    <td>{row.finished || row.overall === 'COMPLETED' ? 'YES' : 'NO'}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => {
                        setDetail(row);
                        setReworkEnd(null);
                        setReworkError(null);
                      }}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr><td colSpan={16} className="text-muted">No wires match this filter.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-muted text-[12px] mt-2">
            Showing {filtered.length} of {rows.length} wires. Missing leg fields display as NOT AVAILABLE (never inferred).
          </p>
        </>
      )}

      {detail ? (
        <Modal title={`Wire ${detail.sno} · ID ${detail.wireId || '—'} — Crimping Detail`} onClose={() => {
          setDetail(null);
          setReworkEnd(null);
          setReworkError(null);
        }} size="wide">
          <div className="sup-crimp-detail grid gap-3 text-[13px]">
            <section>
              <h3 className="font-semibold">General</h3>
              <p>Wire ID: {detail.wireId || '—'} · Ferrule: {detail.ferrule || '—'} · Size: {detail.wireSize || '—'} · Color: {detail.wireColor || '—'} · Length: {detail.length || '—'}</p>
              <p>Group: {detail.groupKey} · Open End: {detail.openEnd || 'none'}</p>
              <p>Required: {detail.crimpingRequired ? 'YES' : 'NO'} · Overall: {detail.overall} · Ready: {detail.readyForWiring ? 'YES' : 'NO'} · Finished: {detail.finished || detail.overall === 'COMPLETED' ? 'YES' : 'NO'} · Wiring: {wiringLabel(detail)}</p>
              {detail.qaHold ? <p className="text-amber-700">QA HOLD</p> : null}
              <p>Technician (assignment): {techLabel}</p>
              <p className="text-[12px] text-muted mt-1">
                Cut: {stLabel(detail.cut?.status)} by {actorLabel(detail.cut?.byName, detail.cut?.by)} at {whenLabel(detail.cut?.at)}
                {' · '}Strip (wire): {stLabel(detail.wireStrip?.status)} by {actorLabel(detail.wireStrip?.byName, detail.wireStrip?.by)} at {whenLabel(detail.wireStrip?.at)}
                {' · '}Crimp (wire): {stLabel(detail.wireCrimp?.status)} by {actorLabel(detail.wireCrimp?.byName, detail.wireCrimp?.by)} at {whenLabel(detail.wireCrimp?.at)}
              </p>
            </section>
            {(['source', 'destination'] as const).map((end) => {
              const e = detail[end];
              const history = Array.isArray(e.reworkHistory) ? e.reworkHistory : [];
              return (
                <section key={end} className="sup-crimp-detail__end border border-[var(--t-border,#E2E8F0)] rounded-lg p-3">
                  <h3 className="font-semibold">{end === 'source' ? 'SOURCE' : 'DESTINATION'}</h3>
                  <p>Device: {e.device || '—'} · Terminal: {e.terminal || '—'} · Side: {e.side || '—'}</p>
                  <p>Leg No: {formatReportCell(e.legNumber)} · Size: {formatReportCell(e.legSize)} · Color: {formatReportCell(e.legColor)}</p>
                  <p>Ferrule Type: {formatReportCell(e.ferruleType)} · Marking: {formatReportCell(e.ferruleMarking)}</p>
                  <p>Strip: {stLabel(e.strippingStatus)} by {actorLabel(e.strippedByName, e.strippedBy)} at {whenLabel(e.strippedAt)}</p>
                  <p>Crimp: {stLabel(e.crimpingStatus)} by {actorLabel(e.crimpedByName, e.crimpedBy)} at {whenLabel(e.crimpedAt)}</p>
                  {detail.crimpingRequired ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={!canMarkRework(e.strippingStatus) || reworkBusy}
                        onClick={() => openReworkForm(end, 'strip')}
                      >
                        Mark Strip Rework
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={!canMarkRework(e.crimpingStatus) || reworkBusy}
                        onClick={() => openReworkForm(end, 'crimp')}
                      >
                        Mark Crimp Rework
                      </button>
                    </div>
                  ) : null}
                  {history.length > 0 ? (
                    <div className="mt-3">
                      <h4 className="font-semibold text-[12px] uppercase tracking-wide text-muted">Rework history</h4>
                      <ul className="mt-1 space-y-1 list-none p-0">
                        {history.map((h, idx) => (
                          <li key={`${end}-${idx}-${h.setAt}`} className="text-[12px] bg-slate-50 rounded px-2 py-1">
                            <strong>{h.operation.toUpperCase()}</strong>
                            {' · '}prev {h.previousStatus}
                            {' · '}{h.reason}
                            {' · '}by {h.setBy}{h.role ? ` (${h.role})` : ''}
                            {' · '}{h.setAt ? new Date(h.setAt).toLocaleString() : '—'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              );
            })}

            {reworkEnd ? (
              <section className="sup-crimp-detail__rework border border-amber-300 bg-amber-50 rounded-lg p-3">
                <h3 className="font-semibold">
                  Mark {reworkOp === 'strip' ? 'Strip' : 'Crimp'} Rework — {reworkEnd === 'source' ? 'SOURCE' : 'DESTINATION'}
                </h3>
                <label className="block mt-2 text-[12px] font-semibold" htmlFor="sup-crimp-rework-reason">
                  Reason (required)
                </label>
                <textarea
                  id="sup-crimp-rework-reason"
                  className="form-input mt-1 w-full min-h-[72px]"
                  value={reworkReason}
                  onChange={(e) => setReworkReason(e.target.value)}
                  placeholder="Describe why rework is required…"
                  disabled={reworkBusy}
                />
                {reworkError ? <p className="text-red-600 text-[12px] mt-1" role="alert">{reworkError}</p> : null}
                <div className="flex gap-2 mt-2">
                  <button type="button" className="btn-primary btn-sm" disabled={reworkBusy} onClick={() => { void submitRework(); }}>
                    {reworkBusy ? 'Saving…' : 'Confirm Rework'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={reworkBusy}
                    onClick={() => { setReworkEnd(null); setReworkError(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {showRequiredModal && allowSetRequired ? (
        <CrimpingRequiredModal
          assignmentId={assignmentId}
          panelName={panelName}
          onClose={() => setShowRequiredModal(false)}
          onSaved={() => { setShowRequiredModal(false); void load(detail?.cableIndex); }}
        />
      ) : null}
    </div>
  );

  if (embedded) return body;
  return (
    <Modal title="Crimping Data" onClose={onClose || (() => undefined)} size="xl">
      {body}
    </Modal>
  );
}
