import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, X, FileDown, FileSpreadsheet, LayoutGrid, CheckCircle2,
  Clock, AlertTriangle, ClipboardList, UserCog, ShieldCheck,
} from '../../ui/icons';
import KpiCard from '../../ui/KpiCard';
import { projectsApi, supervisorApi } from '../../../services/api';
import { useReadOnlyPoll } from '../../../hooks/useReadOnlyPoll';
import { DWES_WIRING_SYNC_MS } from '../../../constants/refreshIntervals';
import type { Cable } from '../../../types';
import {
  deriveExcelHeaders,
  ensureCableList,
  getCellValue,
  DEFAULT_CABLE_STATUS,
  type ExtendedCableStatus,
} from '../../technician/wiring/wiring-utils';
import { buildPanelReportFilename } from '../../../utils/reportFilename';
import WiringScheduleMonitorGrid from './WiringScheduleMonitorGrid';
import CableInspectorPanel from './CableInspectorPanel';
import {
  computeMonitorSummary,
  filterCableIndices,
  pickActiveAssignment,
  sortCableIndices,
  uniqueFacetValues,
  type FrameProgressAssignment,
  type MonitorAssignmentContext,
  type SortState,
  type StatusChipFilter,
} from './monitorUtils';
import * as XLSX from 'xlsx';

interface Props {
  projectCode: string;
  frameId: string;
  panelLabel: string;
}

interface VerifyPayload {
  cables: Cable[];
  mapping: Record<string, string>;
  excel_headers: string[];
  cable_count: number;
  original_filename?: string;
  panel_name?: string;
}

function FacetMultiSelect({
  label,
  options,
  selected,
  onChange,
  swatchFor,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  swatchFor?: (value: string) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const active = selected.size > 0;
  return (
    <div className="wsg-mselect">
      <button
        type="button"
        className={`wsg-tool-btn${active ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {label}
        {active ? ` (${selected.size})` : ''}
        <span className="text-[10px] opacity-60" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="wsg-mselect-menu" role="listbox" aria-label={`${label} filter`}>
          {options.map(opt => {
            const on = selected.has(opt);
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={on}
                className={`wsg-mselect-item${on ? ' on' : ''}`}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(opt);
                  else next.add(opt);
                  onChange(next);
                }}
              >
                <span className="wsg-mselect-check" aria-hidden>{on ? '✓' : ''}</span>
                {swatchFor?.(opt) && (
                  <span className="wsg-mselect-swatch" style={{ background: swatchFor(opt) }} aria-hidden />
                )}
                <span className="wsg-mselect-label">{opt}</span>
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-2 py-2 text-[11px] text-slate-400">No values</p>
          )}
          {active && (
            <button
              type="button"
              className="wsg-mselect-reset"
              onClick={() => onChange(new Set())}
            >
              Clear {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DigitalWiringMonitor({ projectCode, frameId, panelLabel }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verify, setVerify] = useState<VerifyPayload | null>(null);
  const [status, setStatus] = useState<Record<string, ExtendedCableStatus>>({});
  const [assignmentCtx, setAssignmentCtx] = useState<MonitorAssignmentContext | null>(null);
  const [assignments, setAssignments] = useState<FrameProgressAssignment[]>([]);
  const [auditByCable, setAuditByCable] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusChipFilter>('all');
  const [colorFilter, setColorFilter] = useState<Set<string>>(new Set());
  const [sizeFilter, setSizeFilter] = useState<Set<string>>(new Set());
  const [deviceFilter, setDeviceFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState | null>(null);
  const [exporting, setExporting] = useState(false);

  const mapping = verify?.mapping ?? {};
  const excelHeaders = useMemo(
    () => deriveExcelHeaders(mapping, verify?.excel_headers, verify?.cables?.[0]?._raw),
    [mapping, verify?.excel_headers, verify?.cables],
  );
  const cables = useMemo(
    () => ensureCableList(verify?.cables, verify?.cable_count ?? 0, mapping),
    [verify?.cables, verify?.cable_count, mapping],
  );

  const loadExecution = useCallback(async () => {
    try {
      const prog = await supervisorApi.frameProgress(projectCode, frameId);
      const list: FrameProgressAssignment[] = Array.isArray(prog?.assignments) ? prog.assignments : [];
      setAssignments(list);
      const active = pickActiveAssignment(list);
      if (!active) {
        setAssignmentCtx(null);
        setStatus({});
        setAuditByCable({});
        return;
      }
      const detail = await supervisorApi.panelDetail(active.id);
      const next: Record<string, ExtendedCableStatus> = {};
      Object.entries(detail?.assignment?.cable_status || {}).forEach(([k, v]: [string, unknown]) => {
        const row = v as { src?: boolean; dst?: boolean; note?: string; issue?: boolean };
        next[k] = {
          src: !!row.src,
          dst: !!row.dst,
          note: row.note || '',
          issue: !!row.issue,
        };
      });
      setStatus(next);
      setAssignmentCtx({
        id: active.id,
        status: active.status,
        technician_name: active.technician_name,
        started_at: active.started_at,
        completed_at: active.completed_at,
        review_status: active.review_status,
        qc_status: detail?.assignment?.qc_status ?? 'not_ready',
        rework_requested: active.rework_requested,
        rework_reason: detail?.assignment?.rework_reason,
      });
      const auditMap: Record<string, string> = {};
      for (const entry of detail?.audit_trail || []) {
        const idx = String((entry as { cable_index?: number }).cable_index ?? '');
        const at = (entry as { created_at?: string }).created_at;
        if (idx && at) auditMap[idx] = at;
      }
      setAuditByCable(auditMap);
    } catch {
      /* keep last good execution snapshot */
    }
  }, [projectCode, frameId]);

  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    setError('');
    projectsApi.verifyData(projectCode, frameId)
      .then((d: VerifyPayload) => {
        if (signal.cancelled) return;
        setVerify({
          cables: Array.isArray(d?.cables) ? d.cables : [],
          mapping: d?.mapping || {},
          excel_headers: Array.isArray(d?.excel_headers) ? d.excel_headers : [],
          cable_count: d?.cable_count ?? (d?.cables?.length ?? 0),
          original_filename: d?.original_filename,
          panel_name: d?.panel_name,
        });
        return loadExecution();
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        const apiMsg = (err as { response?: { data?: { message?: string }; status?: number } })?.response?.data?.message;
        const httpStatus = (err as { response?: { status?: number } })?.response?.status;
        if (httpStatus === 404) {
          setError(apiMsg || 'Wiring schedule not found for this panel.');
        } else {
          setError(apiMsg || 'Failed to load wiring schedule.');
        }
      })
      .finally(() => {
        if (!signal.cancelled) setLoading(false);
      });
    return () => { signal.cancelled = true; };
  }, [projectCode, frameId, loadExecution]);

  useReadOnlyPoll(loadExecution, DWES_WIRING_SYNC_MS);

  const summary = useMemo(
    () => computeMonitorSummary(cables.length, status, assignmentCtx),
    [cables.length, status, assignmentCtx],
  );

  const visibleIndices = useMemo(() => {
    const filtered = filterCableIndices(cables, status, {
      search,
      statusFilter,
      colorFilter,
      sizeFilter,
      deviceFilter,
    });
    return sortCableIndices(filtered, cables, mapping, sort, status);
  }, [cables, status, search, statusFilter, colorFilter, sizeFilter, deviceFilter, sort, mapping]);

  useEffect(() => {
    if (selectedIndex == null && visibleIndices.length) {
      setSelectedIndex(visibleIndices[0]);
    } else if (selectedIndex != null && !visibleIndices.includes(selectedIndex)) {
      setSelectedIndex(visibleIndices[0] ?? null);
    }
  }, [visibleIndices, selectedIndex]);

  const handleSort = useCallback((key: string) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  }, []);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setColorFilter(new Set());
    setSizeFilter(new Set());
    setDeviceFilter(new Set());
  };

  const exportVisibleCsv = () => {
    const headers = ['#', ...excelHeaders, 'Status'];
    const rows = visibleIndices.map((idx, i) => {
      const cable = cables[idx];
      const st = status[String(idx)] ?? DEFAULT_CABLE_STATUS;
      const cells = excelHeaders.map(h => getCellValue(cable, h, mapping));
      return [i + 1, ...cells, st.issue ? 'Issue' : st.src && st.dst ? 'Completed' : st.src || st.dst ? 'In Progress' : 'Pending'];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Wiring Schedule');
    const base = buildPanelReportFilename({ projectCode, panelName: panelLabel, ext: 'xlsx' });
    XLSX.writeFile(wb, base.replace(/\.xlsx$/i, '_MonitorExport.xlsx'));
  };

  const exportSourceXlsx = async () => {
    setExporting(true);
    try {
      const blob = await supervisorApi.wiringScheduleXlsx(projectCode, frameId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const base = buildPanelReportFilename({ projectCode, panelName: panelLabel, ext: 'xlsx' });
      a.download = base.replace(/\.xlsx$/i, '_Schedule.xlsx');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    document.body.classList.add('dwm-print-active');
    const cleanup = () => {
      document.body.classList.remove('dwm-print-active');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  const colorOptions = useMemo(() => uniqueFacetValues(cables, 'color'), [cables]);
  const sizeOptions = useMemo(() => uniqueFacetValues(cables, 'size'), [cables]);
  const deviceOptions = useMemo(() => uniqueFacetValues(cables, 'device'), [cables]);

  const selectedCable = selectedIndex != null ? cables[selectedIndex] : null;
  const filtersActive = !!search.trim() || statusFilter !== 'all'
    || colorFilter.size > 0 || sizeFilter.size > 0 || deviceFilter.size > 0;

  if (loading) {
    return (
      <div className="wsg-shell dwm-shell">
        <div className="ws-skeleton">
          <div className="ws-skel-bar" />
          <div className="ws-skel-toolbar" />
          <div className="ws-skel-row" />
          <div className="ws-skel-row" />
          <div className="ws-skel-row" />
          <p className="ws-skel-note">Loading Digital Wiring Monitor…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wsg-shell dwm-shell">
        <div className="wsg-empty-hero">
          <p className="wsg-empty-title text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wsg-shell dwm-shell dwm-print-root" aria-label="Digital Wiring Monitor">
      <header className="dwm-header">
        <div className="dwm-header-copy">
          <div className="dwm-header-kicker">
            <LayoutGrid size={14} aria-hidden />
            Digital Wiring Monitor
          </div>
          <h2 className="dwm-header-title">{panelLabel}</h2>
          <p className="dwm-header-sub">
            {verify?.original_filename || 'Wiring schedule'}
            {assignmentCtx?.technician_name ? ` · ${assignmentCtx.technician_name}` : ' · No active assignment'}
            <span className="dwm-readonly-pill">Read-only</span>
          </p>
        </div>
        <div className="dwm-progress-ring" aria-label={`Overall progress ${summary.overallPct}%`}>
          <span className="dwm-progress-value">{summary.overallPct}%</span>
          <span className="dwm-progress-label">Overall</span>
        </div>
      </header>

      <section className="dwm-kpi-strip bento-grid bento-grid--kpis kpi-grid-6" aria-label="Wiring summary">
        <KpiCard label="Total wires" value={summary.total} icon={<LayoutGrid />} />
        <KpiCard label="Completed" value={summary.completed} variant="green" icon={<CheckCircle2 />} />
        <KpiCard label="In progress" value={summary.inProgress} variant="blue" icon={<Clock />} />
        <KpiCard label="Pending" value={summary.pending} variant="amber" icon={<ClipboardList />} />
        <KpiCard label="Verified" value={summary.verified} variant="green" icon={<ShieldCheck />} />
        <KpiCard label="Rework / issues" value={summary.rework} variant="red" icon={<AlertTriangle />} />
      </section>

      <div className="wsg-toolbar dwm-no-print">
        <div className="wsg-search">
          <Search size={15} className="wsg-search-icon" aria-hidden />
          <input
            type="search"
            className="wsg-search-input"
            placeholder="Search ferrule, device, color, path…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search wiring schedule"
          />
          {search && (
            <button type="button" className="wsg-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="wsg-chips" role="group" aria-label="Status filter">
          {([
            ['all', 'All'],
            ['pending', 'Pending'],
            ['progress', 'In progress'],
            ['done', 'Done'],
            ['issue', 'Issues'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`wsg-chip${statusFilter === key ? ' active' : ''}${key === 'issue' ? ' issue' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="wsg-toolbar wsg-toolbar-adv dwm-no-print">
        <span className="wsg-adv-label">Filters</span>
        <FacetMultiSelect label="Color" options={colorOptions} selected={colorFilter} onChange={setColorFilter} />
        <FacetMultiSelect label="Size" options={sizeOptions} selected={sizeFilter} onChange={setSizeFilter} />
        <FacetMultiSelect label="Device" options={deviceOptions.slice(0, 40)} selected={deviceFilter} onChange={setDeviceFilter} />
        {filtersActive && (
          <button type="button" className="wsg-clear-btn" onClick={clearFilters}>Clear filters</button>
        )}
        <div className="wsg-toolbar-right">
          <span className="wsg-count">
            Showing <strong>{visibleIndices.length}</strong> of <strong>{cables.length}</strong>
          </span>
          <button type="button" className="wsg-tool-btn" onClick={exportVisibleCsv} disabled={!visibleIndices.length}>
            <FileSpreadsheet size={14} />
            Export view
          </button>
          <button type="button" className="wsg-tool-btn" onClick={() => void exportSourceXlsx()} disabled={exporting}>
            <FileDown size={14} />
            {exporting ? 'Exporting…' : 'Source XLSX'}
          </button>
          <button type="button" className="wsg-tool-btn" onClick={handlePrint}>
            Print
          </button>
        </div>
      </div>

      <div className="wsg-body">
        <WiringScheduleMonitorGrid
          cables={cables}
          excelHeaders={excelHeaders}
          mapping={mapping}
          status={status}
          visibleIndices={visibleIndices}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          sort={sort}
          onSort={handleSort}
        />
        <div className="dwm-no-print">
          <CableInspectorPanel
            cable={selectedCable}
            index={selectedIndex}
            status={selectedIndex != null ? (status[String(selectedIndex)] ?? DEFAULT_CABLE_STATUS) : DEFAULT_CABLE_STATUS}
            assignment={assignmentCtx}
            cableUpdatedAt={selectedIndex != null ? auditByCable[String(selectedIndex)] : null}
            readOnly
          />
        </div>
      </div>

      <footer className={`wsg-footer${assignments.length ? '' : ' warn'} dwm-no-print`}>
        <div className="wsg-footer-left">
          <UserCog size={14} aria-hidden />
          <span>
            {assignments.length
              ? `${assignments.length} assignment record${assignments.length === 1 ? '' : 's'} on this panel`
              : 'No technician assignment — schedule is available for review only'}
          </span>
        </div>
        <div className="wsg-footer-keys">
          <kbd>↑</kbd><kbd>↓</kbd> navigate rows
        </div>
      </footer>
    </div>
  );
}
