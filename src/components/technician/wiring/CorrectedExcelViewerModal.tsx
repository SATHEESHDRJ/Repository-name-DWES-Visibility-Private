import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, PanelLeftClose, PanelLeftOpen, Search, X } from '../../ui/icons';
import { techApi } from '../../../services/api';
import type { WireCorrectionView } from './SingleWireMatrixCard';

type PreviewSheet = {
  name: string;
  rows: string[][];
  highlightedRows: number[];
  highlightedCells: Array<{ row: number; col: number }>;
};

type PreviewPayload = {
  filename: string;
  relativePath: string;
  displayPath: string;
  workbookSource?: 'corrected' | 'original';
  defaultSheet: string;
  project_name?: string;
  project_code?: string;
  panel_name?: string;
  sheets: PreviewSheet[];
  focus: {
    sheet: string;
    row: number | null;
    col: number | null;
    wireNumber: string | number | null;
  };
  corrections: WireCorrectionView[];
};

interface Props {
  open: boolean;
  assignmentId: number;
  /** Wire to scroll/focus (active wire or a selected correction record). */
  wireNumber: string | number;
  focusField?: string;
  projectCode: string;
  projectName?: string;
  panelName: string;
  onClose: () => void;
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 0.9;

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pickInitialSheet(data: PreviewPayload): string {
  const schedule = data.sheets.find(s => /wiring\s*schedule/i.test(s.name || ''));
  const focus = String(data.focus?.sheet || '').trim();
  if (focus && /wiring\s*schedule/i.test(focus)) return focus;
  if (schedule) return schedule.name;
  if (focus && data.sheets.some(s => s.name === focus)) return focus;
  const preferred = String(data.defaultSheet || '').trim();
  if (preferred && data.sheets.some(s => s.name === preferred)) return preferred;
  return data.sheets[0]?.name || '';
}

function wireHasCorrections(
  corrections: WireCorrectionView[],
  wireNumber: string | number,
): boolean {
  const target = String(wireNumber);
  return corrections.some(
    c => String(c.wire_number ?? '') === target
      || String((c as { cable_index?: number }).cable_index ?? '') === String(Number(wireNumber) - 1),
  );
}

export default function CorrectedExcelViewerModal({
  open,
  assignmentId,
  wireNumber,
  focusField,
  projectCode,
  projectName,
  panelName,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [query, setQuery] = useState('');
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [focusCol, setFocusCol] = useState<number | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const focusRef = useRef<HTMLTableCellElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setZoom(ZOOM_DEFAULT);
    setQuery('');
    techApi.previewCorrectedExcel(assignmentId, wireNumber, focusField)
      .then((data: PreviewPayload) => {
        if (cancelled) return;
        setPreview(data);
        setSheetName(pickInitialSheet(data));
        setFocusRow(data.focus?.row ?? null);
        setFocusCol(data.focus?.col ?? null);
        setSideOpen(wireHasCorrections(data.corrections || [], wireNumber));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e as { response?: { data?: { message?: string } }; message?: string };
        setError(err?.response?.data?.message || err?.message || 'Could not load Excel preview');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => { cancelled = true; };
  }, [open, assignmentId, wireNumber, focusField]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }, [sheetName, focusRow, focusCol, preview, sideOpen]);

  const activeSheet = useMemo(
    () => preview?.sheets.find(s => s.name === sheetName) || preview?.sheets[0] || null,
    [preview, sheetName],
  );

  const wireCorrections = useMemo(() => {
    const list = preview?.corrections || [];
    const target = String(wireNumber);
    return list.filter(c => String(c.wire_number ?? '') === target || String((c as { cable_index?: number }).cable_index ?? '') === String(Number(wireNumber) - 1));
  }, [preview, wireNumber]);

  const panelCorrections = useMemo(
    () => [...(preview?.corrections || [])].sort((a, b) => String(b.corrected_at).localeCompare(String(a.corrected_at))),
    [preview],
  );

  const sidePanel = useMemo(() => {
    if (!wireCorrections.length) return null;
    return [...wireCorrections].sort((a, b) => String(b.corrected_at).localeCompare(String(a.corrected_at)))[0];
  }, [wireCorrections]);

  const filteredRows = useMemo(() => {
    if (!activeSheet) return [];
    const q = query.trim().toLowerCase();
    if (!q) return activeSheet.rows.map((cells, idx) => ({ cells, idx }));
    return activeSheet.rows
      .map((cells, idx) => ({ cells, idx }))
      .filter(({ cells, idx }) => {
        if (idx === 0) return true;
        return cells.some(c => String(c || '').toLowerCase().includes(q));
      });
  }, [activeSheet, query]);

  const headerRow = filteredRows.find(r => r.idx === 0) || null;
  const bodyRows = filteredRows.filter(r => r.idx !== 0);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await techApi.downloadCorrectedExcel(assignmentId);
      triggerBlobDownload(result.blob, result.filename || preview?.filename || `${projectCode}_wiring_schedule.xlsx`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err?.message || 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const sourceLabel = preview?.workbookSource === 'original'
    ? 'Original schedule (read-only)'
    : 'Latest corrected workbook (read-only)';

  return createPortal(
    <div className="swm-modal-root cexv-root" role="presentation">
      <button type="button" className="swm-modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="swm-modal cexv-modal" role="dialog" aria-modal="true" aria-labelledby="cexv-title">
        <header className="swm-modal__header cexv-header">
          <div>
            <h2 id="cexv-title">
              Wiring Schedule Excel · Focus Wire {wireNumber}
            </h2>
            <p className="swm-modal__sub">
              {(preview?.project_name || projectName || projectCode)} · {preview?.panel_name || panelName} · {sourceLabel}
            </p>
          </div>
          <button type="button" className="swm-modal__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="cexv-tabs-row" role="tablist" aria-label="Worksheets">
          <div className="cexv-tabs">
            {(preview?.sheets || []).map(s => (
              <button
                key={s.name}
                type="button"
                role="tab"
                aria-selected={s.name === sheetName}
                className={`cexv-tab${s.name === sheetName ? ' is-active' : ''}`}
                onClick={() => setSheetName(s.name)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="cexv-toolbar">
          <label className="cexv-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search wire / equipment / value"
              aria-label="Search workbook"
            />
          </label>
          <div className="cexv-zoom">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10))}
              aria-label="Zoom out"
            >
              -
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10))}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setSideOpen(v => !v)}
            aria-pressed={sideOpen}
            title={sideOpen ? 'Hide correction detail' : 'Show correction detail'}
          >
            {sideOpen ? <PanelLeftClose size={14} aria-hidden /> : <PanelLeftOpen size={14} aria-hidden />}
            {sideOpen ? 'Hide detail' : 'Show detail'}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => { void download(); }}>
            <Download size={14} aria-hidden /> Download Excel
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className={`cexv-body${sideOpen ? '' : ' cexv-body--side-collapsed'}`}>
          <div className="cexv-grid-wrap" style={{ fontSize: `${zoom}rem` }}>
            {busy && !preview ? <p className="text-muted">Loading workbook…</p> : null}
            {error ? <p className="swm-modal__error" role="alert">{error}</p> : null}
            {activeSheet ? (
              <table className="cexv-grid">
                {headerRow ? (
                  <thead>
                    <tr className="cexv-row--header">
                      {headerRow.cells.map((val, cIdx) => (
                        <th key={cIdx} scope="col" className={cIdx === 0 ? 'cexv-col--sticky' : undefined}>
                          {val || '—'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {bodyRows.map(({ cells, idx }) => {
                    const rowHi = activeSheet.highlightedRows.includes(idx);
                    return (
                      <tr
                        key={idx}
                        className={`${rowHi ? 'cexv-row--corrected' : ''}${focusRow === idx ? ' cexv-row--focus' : ''}`}
                      >
                        {cells.map((val, cIdx) => {
                          const cellHi = activeSheet.highlightedCells.some(h => h.row === idx && h.col === cIdx);
                          const isFocus = focusRow === idx && focusCol === cIdx;
                          return (
                            <td
                              key={cIdx}
                              ref={isFocus ? focusRef : undefined}
                              className={`${cIdx === 0 ? 'cexv-col--sticky' : ''} ${cellHi ? 'cexv-cell--amber' : ''}${isFocus ? ' cexv-cell--focus' : ''}`}
                              onClick={() => {
                                setFocusRow(idx);
                                setFocusCol(cIdx);
                              }}
                            >
                              {val || '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>

          {sideOpen ? (
            <aside className="cexv-side" aria-label="Correction details">
              <h3>Correction detail</h3>
              <dl className="cexv-side__meta">
                <div><dt>Project</dt><dd>{preview?.project_name || projectName || projectCode}</dd></div>
                <div><dt>Project code</dt><dd>{preview?.project_code || projectCode}</dd></div>
                <div><dt>Panel</dt><dd>{preview?.panel_name || panelName}</dd></div>
                <div><dt>Focused wire</dt><dd>{wireNumber}</dd></div>
                <div><dt>File</dt><dd className="cexv-side__file">{preview?.filename || '—'}</dd></div>
                <div><dt>Location</dt><dd>{preview?.displayPath?.replace(/[^/]+$/, '') || '—'}</dd></div>
                <div><dt>Source</dt><dd>{preview?.workbookSource === 'original' ? 'Original upload' : 'Latest corrected'}</dd></div>
                <div><dt>Panel corrections</dt><dd>{panelCorrections.length}</dd></div>
              </dl>
              {sidePanel ? (
                <div className="cexv-side__corr">
                  <p><strong>{sidePanel.field_label}</strong></p>
                  <p>{sidePanel.original_value} → {sidePanel.corrected_value}</p>
                  <p>{sidePanel.technician_name}{sidePanel.technician_username ? ` (@${sidePanel.technician_username})` : ''}</p>
                  <p>Comment: {sidePanel.reason || '—'}</p>
                  <p>{new Date(sidePanel.corrected_at).toLocaleString()}</p>
                </div>
              ) : (
                <p className="text-muted text-[13px]">
                  No correction detail for focused Wire {wireNumber}. Yellow/amber highlights from other
                  corrected wires remain in the grid.
                </p>
              )}
              {panelCorrections.length > 0 ? (
                <ul className="cexv-side__list" aria-label="All panel corrections">
                  {panelCorrections.slice(0, 40).map((c, i) => (
                    <li key={`${c.corrected_at}-${c.field}-${i}`}>
                      Wire {c.wire_number ?? '—'}: {c.field_label} — {c.original_value} → {c.corrected_value}
                    </li>
                  ))}
                </ul>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
