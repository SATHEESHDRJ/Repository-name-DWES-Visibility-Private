import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, X } from '../../ui/icons';
import { displayValue } from './wiring-utils';
import { techApi } from '../../../services/api';
import type { WireCorrectionView } from './SingleWireMatrixCard';
import CorrectedExcelViewerModal from './CorrectedExcelViewerModal';

interface Props {
  open: boolean;
  /** Active wire the technician is currently working on (identity only). */
  activeWireNumber: string | number;
  projectCode: string;
  projectName?: string;
  panelName: string;
  assignmentId: number;
  /** All corrections for this project-panel (not filtered to the active wire). */
  corrections: WireCorrectionView[];
  correctedExcelPath?: string;
  onClose: () => void;
}

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

function safePanelFolder(panelName: string): string {
  const stripped = String(panelName || '').trim().replace(/^=+/, '');
  return stripped.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'PANEL';
}

function wireOf(row: WireCorrectionView): string {
  return String(row.wire_number ?? (typeof (row as any).cable_index === 'number' ? (row as any).cable_index + 1 : '—'));
}

export default function WireCorrectionHistoryModal({
  open,
  activeWireNumber,
  projectCode,
  projectName,
  panelName,
  assignmentId,
  corrections,
  correctedExcelPath = '',
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathShown, setPathShown] = useState(correctedExcelPath);
  const [filenameShown, setFilenameShown] = useState('');
  const [showViewer, setShowViewer] = useState(false);
  const [viewerWireNumber, setViewerWireNumber] = useState<string | number>(activeWireNumber);
  const [viewerFocusField, setViewerFocusField] = useState<string | undefined>(undefined);

  const projectLabel = useMemo(
    () => projectName
      || corrections.find(c => c.project_name)?.project_name
      || projectCode,
    [projectName, corrections, projectCode],
  );

  const locationPath = useMemo(
    () => `uploads/${projectCode}/Corrections/${safePanelFolder(panelName)}/`,
    [projectCode, panelName],
  );

  const filename = useMemo(() => {
    if (filenameShown) return filenameShown;
    const fromRow = [...corrections].reverse().find(c => c.corrected_excel_filename)?.corrected_excel_filename;
    if (fromRow) return fromRow;
    const path = pathShown || correctedExcelPath;
    if (path && path.includes('/')) return path.split('/').pop() || '';
    return '';
  }, [filenameShown, corrections, pathShown, correctedExcelPath]);

  const sortedCorrections = useMemo(
    () => [...corrections].sort((a, b) => String(b.corrected_at).localeCompare(String(a.corrected_at))),
    [corrections],
  );

  if (!open) return null;

  const openViewer = (wire: string | number, field?: string) => {
    setViewerWireNumber(wire);
    setViewerFocusField(field);
    setShowViewer(true);
  };

  const downloadExcel = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await techApi.downloadCorrectedExcel(assignmentId);
      if (result.displayPath) setPathShown(result.displayPath);
      if (result.filename) setFilenameShown(result.filename);
      triggerBlobDownload(result.blob, result.filename || `${projectCode}_wiring_schedule.xlsx`);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not download Excel workbook');
    } finally {
      setBusy(false);
    }
  };

  /* Only one modal/backdrop at a time: hide Correction Centre while Excel is open. */
  if (showViewer) {
    return createPortal(
      <CorrectedExcelViewerModal
        open={showViewer}
        assignmentId={assignmentId}
        wireNumber={viewerWireNumber}
        focusField={viewerFocusField}
        projectCode={projectCode}
        projectName={projectLabel}
        panelName={panelName}
        onClose={() => setShowViewer(false)}
      />,
      document.body,
    );
  }

  return createPortal(
    <div className="swm-modal-root" role="presentation">
      <button type="button" className="swm-modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="swm-modal swm-modal--wide" role="dialog" aria-modal="true" aria-labelledby="wire-corr-history-title">
        <header className="swm-modal__header">
          <div>
            <h2 id="wire-corr-history-title">Correction Centre</h2>
            <p className="swm-modal__sub">
              {projectLabel} · Panel {panelName} · Active wire {activeWireNumber}
            </p>
          </div>
          <button type="button" className="swm-modal__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="swm-modal__body">
          <dl className="swm-history-meta">
            <div>
              <dt>Project</dt>
              <dd>{projectLabel}</dd>
            </div>
            <div>
              <dt>Project code</dt>
              <dd>{projectCode}</dd>
            </div>
            <div>
              <dt>Panel</dt>
              <dd>{panelName}</dd>
            </div>
            <div>
              <dt>Active wire</dt>
              <dd>
                <span className="swm-history-active-wire">Wire {activeWireNumber}</span>
              </dd>
            </div>
            <div>
              <dt>Workbook</dt>
              <dd className="swm-history-meta__file">{filename || 'Latest project-panel schedule'}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd><code className="swm-history-file__path">{locationPath}</code></dd>
            </div>
          </dl>

          <div className="swm-history-file" role="group" aria-label="Project-panel Excel actions">
            <p className="swm-history-file__hint">
              View Excel opens the latest corrected workbook for this project and panel (or the original
              uploaded schedule if no corrections exist yet). Highlights from other wires remain visible.
            </p>
            <div className="swm-history-file__actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busy}
                onClick={() => openViewer(activeWireNumber)}
              >
                <Eye size={14} aria-hidden /> View Excel
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() => { void downloadExcel(); }}
              >
                <Download size={14} aria-hidden /> Download Excel
              </button>
            </div>
            {error && <p className="swm-modal__error" role="alert">{error}</p>}
          </div>

          {sortedCorrections.length === 0 ? (
            <p className="text-muted text-[13px]">
              No corrections recorded for this panel yet. You can still view or download the original
              wiring schedule workbook.
            </p>
          ) : (
            <div className="swm-history-table-wrap">
              <table className="swm-history-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Wire</th>
                    <th>Parameter</th>
                    <th>Original</th>
                    <th>Corrected</th>
                    <th>Reason</th>
                    <th>Technician</th>
                    <th>Username</th>
                    <th>File</th>
                    <th>Status</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCorrections.map((row, idx) => {
                    const wire = wireOf(row);
                    const isActive = String(wire) === String(activeWireNumber);
                    return (
                      <tr
                        key={`${row.corrected_at}-${row.field}-${idx}`}
                        className={isActive ? 'swm-history-row--active' : undefined}
                      >
                        <td>{new Date(row.corrected_at).toLocaleString()}</td>
                        <td>
                          <span className={isActive ? 'swm-history-active-wire' : undefined}>
                            {wire}
                            {isActive ? ' · active' : ''}
                          </span>
                        </td>
                        <td>{row.field_label}</td>
                        <td>{displayValue(row.original_value)}</td>
                        <td className="swm-history-corrected">{displayValue(row.corrected_value)}</td>
                        <td>{row.reason}</td>
                        <td>{row.technician_name}</td>
                        <td>{row.technician_username ? `@${row.technician_username}` : '—'}</td>
                        <td className="swm-history-meta__file">{row.corrected_excel_filename || filename || '—'}</td>
                        <td>{row.status || 'corrected'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary btn-sm swm-history-view-btn"
                            disabled={busy}
                            onClick={() => openViewer(wire, row.field)}
                            title={`View Excel focused on Wire ${wire}`}
                          >
                            <Eye size={14} aria-hidden />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <footer className="swm-modal__footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
