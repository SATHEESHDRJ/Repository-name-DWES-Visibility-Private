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
import * as XLSX from 'xlsx';
import PdfDocumentViewer, { asPdfBlob } from './PdfDocumentViewer';
import {
  Download,
  Maximize,
  ZoomIn,
  ZoomOut,
} from './icons';

export type FileViewerType = 'pdf' | 'image' | 'excel' | 'csv' | 'download-only';

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
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.12;

async function parseSpreadsheetAsync(blob: Blob, sheetName?: string) {
  const buf = await blob.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const activeSheet = sheetName && wb.SheetNames.includes(sheetName)
    ? sheetName
    : wb.SheetNames[0];
  if (!activeSheet) return { headers: [] as string[], rows: [] as string[][], activeSheet: '' };
  const sheet = wb.Sheets[activeSheet];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!raw.length) return { headers: [], rows: [], activeSheet };
  const headers = (raw[0] as unknown[]).map(c => String(c ?? '').trim());
  const rows = raw.slice(1).map(row =>
    headers.map((_, i) => String((row as unknown[])[i] ?? '').trim()),
  );
  return { headers, rows, activeSheet };
}

function ImageCanvasViewer({
  blob,
  title,
  zoom,
  onZoomChange,
  onWheelZoom,
}: {
  blob: Blob;
  title: string;
  zoom: number;
  onZoomChange: (z: number) => void;
  onWheelZoom: (delta: number) => void;
}) {
  const [url, setUrl] = useState('');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

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
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
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
        <img src={url} alt={title} className="file-viewer-image" draggable={false} />
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
}: FileViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'fit' | 'custom'>('fit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sheetData, setSheetData] = useState<{ headers: string[]; rows: string[][]; activeSheet: string } | null>(null);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!blob || (fileType !== 'excel' && fileType !== 'csv')) {
      setSheetData(null);
      setParseError('');
      return;
    }
    let cancelled = false;
    setParsing(true);
    setParseError('');
    parseSpreadsheetAsync(blob, sheetName)
      .then(data => {
        if (!cancelled) setSheetData(data);
      })
      .catch(() => {
        if (!cancelled) setParseError('Could not parse spreadsheet file.');
      })
      .finally(() => {
        if (!cancelled) setParsing(false);
      });
    return () => { cancelled = true; };
  }, [blob, fileType, sheetName]);

  const applyZoomDelta = useCallback((delta: number) => {
    setFitMode('custom');
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);

  const zoomIn = () => applyZoomDelta(ZOOM_STEP);
  const zoomOut = () => applyZoomDelta(-ZOOM_STEP);
  const resetZoom = () => {
    setFitMode('fit');
    setZoom(1);
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
              {fitMode === 'custom' ? `${Math.round(zoom * 100)}%` : 'Fit'}
            </span>
            <button type="button" className="file-viewer-btn" onClick={zoomIn} disabled={busy || !!displayError} aria-label="Zoom in">
              <ZoomIn size={18} strokeWidth={1.75} />
            </button>
            <span className="file-viewer-divider" aria-hidden />
            <button
              type="button"
              className={`file-viewer-btn file-viewer-btn--text${fitMode === 'fit' ? ' is-active' : ''}`}
              onClick={resetZoom}
              disabled={busy || !!displayError}
            >
              Fit / Reset
            </button>
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
      return <div className="file-viewer-loading">Loading file…</div>;
    }
    if (!blob) return null;

    if (fileType === 'pdf') {
      return (
        <PdfDocumentViewer
          blob={asPdfBlob(blob)}
          title={title}
          downloadFilename={fileName}
          className="file-viewer-pdf"
        />
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
        />
      );
    }

    if (fileType === 'excel' || fileType === 'csv') {
      if (!sheetData) return <div className="file-viewer-loading">Parsing spreadsheet…</div>;
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
        <p className="text-[14px] font-semibold text-slate-800">{title}</p>
        <p className="text-[13px] text-slate-500 mt-2 max-w-md text-center">
          This file type cannot be previewed in the browser. Use Download to open it in a compatible application.
        </p>
      </div>
    );
  }, [blob, busy, displayError, fileName, fileType, onRetry, sheetData, sheetName, title, zoom, applyZoomDelta]);

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
