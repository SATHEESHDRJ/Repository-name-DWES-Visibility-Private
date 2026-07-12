import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, X, FileDown, FileSpreadsheet, LayoutGrid,
} from '../../ui/icons';
import { projectsApi, supervisorApi } from '../../../services/api';
import type { Cable } from '../../../types';
import {
  deriveExcelHeaders,
  ensureCableList,
  getCellValue,
  type ExtendedCableStatus,
} from '../../technician/wiring/wiring-utils';
import { buildPanelReportFilename } from '../../../utils/reportFilename';
import WiringScheduleMonitorGrid from './WiringScheduleMonitorGrid';
import CableInspectorPanel from './CableInspectorPanel';
import {
  filterCableIndices,
  sortCableIndices,
  uniqueFacetValues,
  type SortState,
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

/** The monitor renders the converted schedule only — no execution status is merged. */
const EMPTY_STATUS: Record<string, ExtendedCableStatus> = {};

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');
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
  }, [projectCode, frameId]);

  const visibleIndices = useMemo(() => {
    const filtered = filterCableIndices(cables, EMPTY_STATUS, {
      search,
      statusFilter: 'all',
      colorFilter,
      sizeFilter,
      deviceFilter,
    });
    return sortCableIndices(filtered, cables, mapping, sort, EMPTY_STATUS);
  }, [cables, search, colorFilter, sizeFilter, deviceFilter, sort, mapping]);

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
    setColorFilter(new Set());
    setSizeFilter(new Set());
    setDeviceFilter(new Set());
  };

  const exportVisibleCsv = () => {
    const headers = ['#', ...excelHeaders];
    const rows = visibleIndices.map((idx, i) => {
      const cable = cables[idx];
      const cells = excelHeaders.map(h => getCellValue(cable, h, mapping));
      return [i + 1, ...cells];
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
  const filtersActive = !!search.trim()
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
            <span className="dwm-readonly-pill">Read-only</span>
          </p>
        </div>
      </header>

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
            readOnly
          />
        </div>
      </div>

      <footer className="wsg-footer dwm-no-print">
        <div className="wsg-footer-left">
          <LayoutGrid size={14} aria-hidden />
          <span>
            {cables.length} wire{cables.length === 1 ? '' : 's'} in converted schedule
          </span>
        </div>
        <div className="wsg-footer-keys">
          <kbd>↑</kbd><kbd>↓</kbd> navigate rows
        </div>
      </footer>
    </div>
  );
}
