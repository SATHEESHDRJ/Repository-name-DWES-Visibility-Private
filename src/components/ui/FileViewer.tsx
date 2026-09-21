import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { lazy, Suspense } from 'react';
const PdfDocumentViewer = lazy(() => import('./PdfDocumentViewer'));

import type { PdfFocusRegion } from './PdfDocumentViewer';
import { asPdfBlob } from '../../utils/blobResponse';
export { asPdfBlob };
import {
  Download,
  Maximize,
  ZoomIn,
  ZoomOut,
} from './icons';
import { DwesLoadingIndicator } from './DwesLoadingIndicator';

export type FileViewerType = 'pdf' | 'image' | 'csv' | 'excel' | 'download-only';

export interface FileViewerProps {
  blob: Blob | null;
  fileType: FileViewerType;
  panelLabel: string;
  fileName?: string;
  sheetName?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onDownload?: () => void;
  className?: string;
  /** LIVE TB: auto-zoom/pan PDF to this normalized page region. */
  focusRegion?: PdfFocusRegion | null;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.12;

/** Parse CSV blob into headers + rows. */
async function parseCsvAsync(blob: Blob) {
  const text = await blob.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][], activeSheet: 'Sheet1' };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => line.split(',').map(c => c.trim()));
  return { headers, rows, activeSheet: 'Sheet1' };
}

function ImageCanvasViewer({
  blob,
  title,
  zoom,
  onZoomChange,
  onWheelZoom,
  rotation,
  resetToken,
  fitMode,
}: {
  blob: Blob;
  title: string;
  zoom: number;
  onZoomChange: (z: number) => void;
  onWheelZoom: (delta: number) => void;
  rotation: number;
  resetToken: number;
  fitMode: 'width' | 'page' | 'custom';
}) {
  const [url, setUrl] = useState('');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => { setPan({ x: 0, y: 0 }); }, [resetToken]);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onWheelZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    }
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { dist, zoom };
    }
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const scale = dist / pinchRef.current.dist;
    onZoomChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchRef.current.zoom * scale)));
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const style: CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
    transformOrigin: 'center center',
  };

  return (
    <div
      ref={viewportRef}
      className="file-viewer-image-viewport"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="file-viewer-image-stage"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={url}
          alt={title}
          className={`file-viewer-image file-viewer-image--${fitMode}`}
          draggable={false}
          style={fitMode === 'width'
            ? { width: '100%', height: 'auto', maxWidth: 'none', maxHeight: 'none' }
            : fitMode === 'page'
              ? { width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%' }
              : { width: 'auto', height: 'auto', maxWidth: 'none', maxHeight: 'none' }}
        />
      </div>
    </div>
  );
}

function SpreadsheetTableViewer({
  headers,
  rows,
  sheetLabel,
  zoom,
  onWheelZoom,
}: {
  headers: string[];
  rows: string[][];
  sheetLabel: string;
  zoom: number;
  onWheelZoom: (delta: number) => void;
}) {
  const onWheel = (e: ReactWheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onWheelZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    }
  };

  return (
    <div className="file-viewer-spreadsheet-wrap" onWheel={onWheel}>
      <div className="file-viewer-spreadsheet-meta" role="status">
        Sheet: <strong>{sheetLabel}</strong> · {rows.length} row{rows.length === 1 ? '' : 's'} · {headers.length} column{headers.length === 1 ? '' : 's'}
      </div>
      <div className="file-viewer-spreadsheet-scroll">
        <table
          className="file-viewer-spreadsheet"
          style={{ fontSize: `${Math.round(13 * zoom)}px` }}
          aria-label={`Read-only spreadsheet — ${sheetLabel}`}
        >
          <thead>
            <tr>
              <th className="file-viewer-spreadsheet-idx" scope="col">#</th>
              {headers.map(h => (
                <th key={h} scope="col" title={h}>{h || '—'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td className="file-viewer-spreadsheet-idx">{ri + 1}</td>
                {headers.map((_, ci) => (
                  <td key={ci} title={row[ci]}>{row[ci] || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FileViewer({
  blob,
  fileType,
  panelLabel,
  fileName,
  sheetName,
  loading = false,
  error = '',
  onRetry,
  onDownload,
  className = '',
  focusRegion = null,
}: FileViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'width' | 'page' | 'custom'>('page');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [sheetData, setSheetData] = useState<{ headers: string[]; rows: string[][]; activeSheet: string } | null>(null);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

useEffect(() => {
    if (!blob || fileType !== 'csv') {
      setSheetData(null);
      setParseError('');
      return;
    }
    let cancelled = false;
    setParsing(true);
    setParseError('');
    parseCsvAsync(blob)
      .then(data => {
        if (!cancelled) setSheetData(data);
      })
      .catch(err => {
        if (!cancelled) setParseError(err instanceof Error ? err.message : 'Failed to parse CSV');
      })
      .finally(() => {
        if (!cancelled) setParsing(false);
      });
    return () => { cancelled = true; };
  }, [blob, fileType]);

  const applyZoomDelta = useCallback((delta: number) => {
    setFitMode('custom');
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);

  const zoomIn = () => applyZoomDelta(ZOOM_STEP);
  const zoomOut = () => applyZoomDelta(-ZOOM_STEP);
  const resetZoom = () => {
    setFitMode('page');
    setZoom(1);
    setRotation(0);
    setResetToken(token => token + 1);
  };

  const toggleFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    try {
      await el.requestFullscreen();
    } catch {
      /* blocked */
    }
  }, []);

  const displayError = error || parseError;
  const busy = loading || parsing;
  const title = fileName || panelLabel;

  const toolbar = (
    <div className="file-viewer-toolbar" role="toolbar" aria-label="File viewer controls">
      <div className="file-viewer-toolbar-group">
        {fileType !== 'download-only' && (
          <>
            <button type="button" className="file-viewer-btn" onClick={zoomOut} disabled={busy || !!displayError} aria-label="Zoom out">
              <ZoomOut size={18} strokeWidth={1.75} />
            </button>
            <span className="file-viewer-zoom-label" aria-live="polite">
              {fitMode === 'custom' ? `${Math.round(zoom * 100)}%` : fitMode === 'width' ? 'Fit width' : 'Fit page'}
            </span>
            <button type="button" className="file-viewer-btn" onClick={zoomIn} disabled={busy || !!displayError} aria-label="Zoom in">
              <ZoomIn size={18} strokeWidth={1.75} />
            </button>
            <span className="file-viewer-divider" aria-hidden />
            <button
              type="button"
              className={`file-viewer-btn file-viewer-btn--text${fitMode === 'width' ? ' is-active' : ''}`}
              onClick={() => { setFitMode('width'); setZoom(1); setResetToken(token => token + 1); }}
              disabled={busy || !!displayError}
            >
              Fit width
            </button>
            <button
              type="button"
              className={`file-viewer-btn file-viewer-btn--text${fitMode === 'page' ? ' is-active' : ''}`}
              onClick={() => { setFitMode('page'); setZoom(1); setResetToken(token => token + 1); }}
              disabled={busy || !!displayError}
            >
              Fit page
            </button>
            <button type="button" className="file-viewer-btn file-viewer-btn--text" onClick={resetZoom} disabled={busy || !!displayError}>
              Reset
            </button>
            {fileType === 'image' && (
              <button
                type="button"
                className="file-viewer-btn file-viewer-btn--text"
                onClick={() => setRotation(value => (value + 90) % 360)}
                disabled={busy || !!displayError}
              >
                Rotate 90°
              </button>
            )}
          </>
        )}
      </div>
      <div className="file-viewer-toolbar-group file-viewer-toolbar-group--end">
        <button
          type="button"
          className="file-viewer-btn"
          onClick={() => void toggleFullscreen()}
          disabled={busy || !!displayError}
          aria-label="Toggle fullscreen"
        >
          <Maximize size={18} strokeWidth={1.75} />
        </button>
        {onDownload && (
          <button type="button" className="file-viewer-btn file-viewer-btn--text" onClick={onDownload}>
            <Download size={16} strokeWidth={1.75} />
            <span>Download</span>
          </button>
        )}
      </div>
    </div>
  );

  const body = useMemo(() => {
    if (displayError) {
      return (
        <div className="file-viewer-error">
          <p className="form-error m-0">{displayError}</p>
          {onRetry && (
            <button type="button" className="btn-secondary mt-3" onClick={onRetry}>Retry</button>
          )}
        </div>
      );
    }
    if (busy) {
      return (
        <div className="file-viewer-loading">
          <DwesLoadingIndicator label="Loading file…" />
        </div>
      );
    }
    if (!blob) return null;

    if (fileType === 'pdf') {
      return (
        <Suspense fallback={(
          <div className="file-viewer-loading">
            <DwesLoadingIndicator label="Loading PDF viewer…" />
          </div>
        )}>
          <PdfDocumentViewer
            blob={asPdfBlob(blob)}
            title={title}
            downloadFilename={onDownload ? fileName : undefined}
            onDownload={onDownload}
            className="file-viewer-pdf"
            focusRegion={focusRegion}
          />
        </Suspense>
      );
    }

    if (fileType === 'image') {
      return (
        <ImageCanvasViewer
          blob={blob}
          title={title}
          zoom={zoom}
          onZoomChange={setZoom}
          onWheelZoom={applyZoomDelta}
          rotation={rotation}
          resetToken={resetToken}
          fitMode={fitMode}
        />
      );
    }

    if (fileType === 'csv') {
      if (!sheetData) return <div className="file-viewer-loading">Parsing CSV…</div>;
      return (
        <SpreadsheetTableViewer
          headers={sheetData.headers}
          rows={sheetData.rows}
          sheetLabel={sheetData.activeSheet || sheetName || 'Sheet1'}
          zoom={zoom}
          onWheelZoom={applyZoomDelta}
        />
      );
    }

    return (
      <div className="file-viewer-download-only">
        <p className="text-[14px] font-semibold text-primary">{title}</p>
        <p className="text-[13px] text-muted mt-2 max-w-md text-center">
          This file type cannot be previewed in the browser. Use Download to open it in a compatible application.
        </p>
      </div>
    );
  }, [blob, busy, displayError, fileName, fileType, fitMode, focusRegion, onDownload, onRetry, resetToken, rotation, sheetData, sheetName, title, zoom, applyZoomDelta]);

  return (
    <div
      ref={shellRef}
      className={`file-viewer ${isFullscreen ? 'file-viewer--fullscreen' : ''} ${className}`.trim()}
    >
      {fileType !== 'pdf' && toolbar}
      <div className="file-viewer-body">{body}</div>
    </div>
  );
}
