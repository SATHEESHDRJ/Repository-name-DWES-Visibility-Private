import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  Cable, FileText, Maximize2, Minimize2, X,
} from '../../ui/icons';
import WorkspaceSectionHeading from '../../ui/WorkspaceSectionHeading';
import {
  buildLengthAwareWirePath,
  cablePathVisualMetrics,
  wireColorHex,
} from './wiring-utils';
import { DwesLoadingCenter } from '../../ui/DwesLoadingIndicator';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type Ot2dRouteClass =
  | 'approved-exact'
  | 'calculated-guidance'
  | 'endpoint-guidance'
  | 'route-not-mapped';

export interface Ot2dDevice {
  id: string;
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  placed?: boolean;
  side?: string;
}

export interface Ot2dTerminal {
  id: string;
  deviceId: string;
  terminalNumber: string;
  x: number;
  y: number;
  placed?: boolean;
}

export interface Ot2dWire {
  wiringRowId: string;
  sno: string;
  sourceTwinTerminalId: string | null;
  destinationTwinTerminalId: string | null;
  sourceLabel?: string | null;
  destinationLabel?: string | null;
  points: Array<{ x: number; y: number }>;
  classification: Ot2dRouteClass;
  color?: string;
}

export interface Ot2dWireHint {
  sno?: string | number;
  source?: string;
  destination?: string;
  color?: string;
  size?: string;
  ferrule?: string;
  ref?: string;
  length?: string;
}

export interface Ot2dLayoutPayload {
  drawingMode: 'GEOMETRY' | 'SCHEMATIC' | 'DRAWING';
  classification: Ot2dRouteClass;
  routeLabel: string;
  disclaimer?: string;
  scheduleRevision?: string | null;
  panel: { width: number; height: number; units?: string | null };
  devices: Ot2dDevice[];
  terminals: Ot2dTerminal[];
  ductSegments?: Array<{ id: string; points: Array<{ x: number; y: number }>; approved?: boolean }>;
  wires?: Ot2dWire[];
  activeWire?: Ot2dWire | null;
  /** Schedule endpoint text for the active serial (from wiring row). */
  wireStatusHint?: Ot2dWireHint | null;
  hasApprovedDrawing?: boolean;
  diagnostics?: { note?: string; fallbackReason?: string | null };
}

export type WireVisualStatus = 'pending' | 'in_progress' | 'paused' | 'skipped' | 'completed';

export interface OperationalTwin2DProps {
  payload: Ot2dLayoutPayload | null;
  loading?: boolean;
  error?: string | null;
  /** Authoritative wire status from existing assignment — never a second status field. */
  wireStatus?: WireVisualStatus;
  /**
   * Status keyed by S.No for multi-cable live trail (geometry mode only).
   * Ignored on PDF-primary technician compact view.
   */
  wireStatusesBySno?: Record<string, WireVisualStatus>;
  /** Optional schedule fallback when geometry labels are missing. */
  endpointHint?: { source?: string; destination?: string } | null;
  /** Schedule colour / length / labels for the active cable (PDF overlay + path). */
  scheduleCable?: {
    sno?: string | number;
    color?: string | null;
    length?: string | null;
    size?: string | null;
    source?: string | null;
    destination?: string | null;
  } | null;
  /** Approved panel PDF (or image) — primary twin surface. */
  drawingBlob?: Blob | null;
  drawingLoading?: boolean;
  drawingError?: string | null;
  drawingName?: string | null;
  readOnly?: boolean;
  compact?: boolean;
  showCompletedEndpoints?: boolean;
  showCompletedRoutes?: boolean;
  className?: string;
  onRequestFullscreen?: () => void;
}

const ROUTE_TONE: Record<Ot2dRouteClass, string> = {
  'approved-exact': 'ot2d-badge--ok',
  'calculated-guidance': 'ot2d-badge--info',
  'endpoint-guidance': 'ot2d-badge--info',
  'route-not-mapped': 'ot2d-badge--warn',
};

function formatTermLabel(
  term: Ot2dTerminal | null,
  devices: Ot2dDevice[],
  fallback?: string | null,
): string {
  if (term) {
    const device = devices.find(d => d.id === term.deviceId);
    const tag = String(device?.tag ?? '').trim();
    const num = String(term.terminalNumber ?? '').trim();
    if (tag && num) return `${tag}:${num}`;
    if (tag) return tag;
    if (num) return num;
  }
  const fb = String(fallback ?? '').trim();
  return fb || '—';
}

function statusRing(status: WireVisualStatus | undefined): string {
  switch (status) {
    case 'completed': return '#16a34a';
    case 'in_progress': return '#2563eb';
    case 'paused': return '#d97706';
    case 'skipped': return '#ca8a04';
    default: return '#64748b';
  }
}

/** Slim first-page PDF renderer — no search/zoom chrome; paper-like twin backdrop. */
function PdfDrawingBackdrop({
  blob,
  title,
}: {
  blob: Blob;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState('');
  const [rendering, setRendering] = useState(true);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    const gen = { n: 0 };
    setErr('');
    setRendering(true);

    (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        if (docRef.current) void docRef.current.destroy();
        docRef.current = doc;
        const page = await doc.getPage(1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        // Cap render width for tablet memory; CSS scales the canvas to fit.
        const targetW = Math.min(1400, Math.max(720, base.width));
        const scale = targetW / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        gen.n += 1;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendering(false);
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Unable to render approved drawing PDF.');
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (docRef.current) {
        void docRef.current.destroy();
        docRef.current = null;
      }
    };
  }, [blob]);

  return (
    <div className="ot2d-pdf-stage" aria-label={title}>
      {rendering && <p className="ot2d-loading ot2d-pdf-loading">Rendering approved drawing…</p>}
      {err && <p className="ot2d-error" role="alert">{err}</p>}
      <canvas ref={canvasRef} className="ot2d-pdf-canvas" />
    </div>
  );
}

function ImageDrawingBackdrop({ blob, title }: { blob: Blob; title: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return (
    <div className="ot2d-pdf-stage" aria-label={title}>
      <img src={url} alt={title} className="ot2d-pdf-canvas ot2d-pdf-canvas--img" />
    </div>
  );
}

function ScheduleCableOverlay({
  color,
  length,
  srcLabel,
  dstLabel,
  sno,
  wireStatus,
  size,
}: {
  color?: string | null;
  length?: string | null;
  srcLabel: string;
  dstLabel: string;
  sno: string;
  wireStatus: WireVisualStatus;
  size?: string | null;
}) {
  const { hex, hex2 } = wireColorHex(color ?? undefined);
  const metrics = cablePathVisualMetrics(length);
  const d = buildLengthAwareWirePath(length);
  const gradId = `ot2d-wire-grad-${sno.replace(/[^\w-]/g, '')}`;
  const ring = statusRing(wireStatus);

  return (
    <svg
      className="ot2d-overlay-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        {hex2 ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={hex} />
            <stop offset="50%" stopColor={hex} />
            <stop offset="50%" stopColor={hex2} />
            <stop offset="100%" stopColor={hex2} />
          </linearGradient>
        ) : null}
        <marker
          id={`${gradId}-arrow`}
          markerWidth="5"
          markerHeight="5"
          refX="4"
          refY="2.5"
          orient="auto"
        >
          <path d="M0,0 L5,2.5 L0,5 Z" fill={hex2 ? hex2 : hex} />
        </marker>
      </defs>

      {/* Soft halo so the wire reads on busy scheme drawings */}
      <path
        d={d}
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={metrics.strokeWidth + 2.2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke={hex2 ? `url(#${gradId})` : hex}
        strokeWidth={metrics.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={metrics.dashPattern}
        markerEnd={`url(#${gradId}-arrow)`}
        vectorEffect="non-scaling-stroke"
        className="ot2d-overlay-wire"
      />

      {/* SRC */}
      <g className="ot2d-overlay-ep">
        <circle cx={50 - metrics.spanPct * 50} cy={42} r={2.8} fill="#1d4ed8" stroke={ring} strokeWidth={0.6} />
        <text x={50 - metrics.spanPct * 50} y={36} textAnchor="middle" className="ot2d-overlay-role">SRC</text>
        <text x={50 - metrics.spanPct * 50} y={48.5} textAnchor="middle" className="ot2d-overlay-label">{srcLabel}</text>
      </g>
      {/* DST */}
      <g className="ot2d-overlay-ep">
        <circle cx={50 + metrics.spanPct * 50} cy={58} r={2.8} fill="#c2410c" stroke={ring} strokeWidth={0.6} />
        <text x={50 + metrics.spanPct * 50} y={52} textAnchor="middle" className="ot2d-overlay-role">DST</text>
        <text x={50 + metrics.spanPct * 50} y={64.5} textAnchor="middle" className="ot2d-overlay-label">{dstLabel}</text>
      </g>

      <text x={50} y={28} textAnchor="middle" className="ot2d-overlay-meta">
        {`S.${sno}`}
        {color ? ` · ${color}` : ''}
        {length ? ` · ${length}` : ''}
        {size ? ` · ${size}` : ''}
      </text>
    </svg>
  );
}

/**
 * OperationalTwin2D — PDF-primary operational twin for technician wiring.
 * Approved panel PDF is the layout surface; schedule colour + length drive the
 * SRC→DST overlay. Fake Excel schematic boxes are not shown when a drawing exists.
 * Flat/Engineering 3D stay behind feature flag (never fabricated here).
 */
export default function OperationalTwin2D({
  payload,
  loading,
  error,
  wireStatus = 'pending',
  endpointHint = null,
  scheduleCable = null,
  drawingBlob = null,
  drawingLoading = false,
  drawingError = null,
  drawingName = null,
  readOnly = false,
  compact = false,
  className = '',
  onRequestFullscreen,
}: OperationalTwin2DProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const hint = payload?.wireStatusHint ?? null;
  const active = payload?.activeWire ?? null;
  const devices = payload?.devices ?? [];
  const terminals = payload?.terminals ?? [];

  const activeSource = useMemo(
    () => terminals.find(t => t.id === active?.sourceTwinTerminalId) ?? null,
    [terminals, active],
  );
  const activeDest = useMemo(
    () => terminals.find(t => t.id === active?.destinationTwinTerminalId) ?? null,
    [terminals, active],
  );

  const srcLabel = useMemo(
    () => formatTermLabel(
      activeSource,
      devices,
      scheduleCable?.source || active?.sourceLabel || hint?.source || endpointHint?.source || null,
    ),
    [activeSource, devices, scheduleCable?.source, active?.sourceLabel, hint?.source, endpointHint?.source],
  );
  const dstLabel = useMemo(
    () => formatTermLabel(
      activeDest,
      devices,
      scheduleCable?.destination || active?.destinationLabel || hint?.destination || endpointHint?.destination || null,
    ),
    [activeDest, devices, scheduleCable?.destination, active?.destinationLabel, hint?.destination, endpointHint?.destination],
  );

  const sno = String(
    scheduleCable?.sno ?? active?.sno ?? hint?.sno ?? '—',
  );
  const wireColor = scheduleCable?.color ?? hint?.color ?? active?.color ?? null;
  const wireLength = scheduleCable?.length ?? hint?.length ?? null;
  const wireSize = scheduleCable?.size ?? hint?.size ?? null;
  const { hex, hex2 } = wireColorHex(wireColor ?? undefined);

  const hasPdf = Boolean(drawingBlob) && !drawingError;
  const isPdfMime = Boolean(
    drawingBlob
    && (drawingBlob.type === 'application/pdf'
      || drawingBlob.type === ''
      || /pdf/i.test(drawingName || '')),
  );
  const isImageMime = Boolean(
    drawingBlob
    && /^image\//i.test(drawingBlob.type),
  );

  const routeClass: Ot2dRouteClass = hasPdf
    ? (payload?.classification === 'approved-exact' ? 'approved-exact' : 'endpoint-guidance')
    : (payload?.classification ?? 'route-not-mapped');

  const routeLabel = hasPdf
    ? (payload?.classification === 'approved-exact'
      ? 'Approved Exact Route'
      : 'Drawing Reference — schedule path on approved PDF')
    : (payload?.routeLabel ?? 'Approved drawing not uploaded');

  const subtitle = hasPdf
    ? `Approved drawing${drawingName ? ` · ${drawingName}` : ''} · colour-accurate path`
    : drawingLoading
      ? 'Loading approved drawing…'
      : loading
        ? 'Loading…'
        : 'Awaiting approved PDF drawing';

  const toggleFs = useCallback(() => {
    if (onRequestFullscreen) onRequestFullscreen();
    else setFullscreen(f => !f);
  }, [onRequestFullscreen]);

  const viewer = (
    <div className={`ot2d-root ot2d-root--pdf-primary${compact ? ' ot2d-root--compact' : ''}${readOnly ? ' ot2d-root--readonly' : ''}${className ? ` ${className}` : ''}`}>
      <WorkspaceSectionHeading
        title="Operational Twin"
        icon={<Cable size={16} />}
        subtitle={subtitle}
        actions={(
          <div className="ot2d-toolbar" role="toolbar" aria-label="Operational twin controls">
            {!readOnly && (
              <button
                type="button"
                className="ot2d-tool-btn"
                onClick={toggleFs}
                title={fullscreen ? 'Exit full view' : 'Full view'}
                aria-label={fullscreen ? 'Exit full view' : 'Full view'}
              >
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
          </div>
        )}
      />

      <div className="ot2d-legend" aria-live="polite">
        <span className="ot2d-legend-sno">S.{sno}</span>
        <span className="ot2d-legend-ep ot2d-legend-ep--src" title="Source">
          <span className="ot2d-legend-role">SRC</span>
          <span className="ot2d-legend-val">{srcLabel}</span>
        </span>
        <span className="ot2d-legend-arrow" aria-hidden="true">→</span>
        <span className="ot2d-legend-ep ot2d-legend-ep--dst" title="Destination">
          <span className="ot2d-legend-role">DST</span>
          <span className="ot2d-legend-val">{dstLabel}</span>
        </span>
        <span
          className="ot2d-legend-swatch"
          style={{
            background: hex2
              ? `linear-gradient(90deg, ${hex} 50%, ${hex2} 50%)`
              : hex,
          }}
          title={wireColor || 'Wire colour'}
        />
        {wireColor && <span className="ot2d-legend-color">{wireColor}</span>}
        {wireLength && <span className="ot2d-legend-len">{wireLength}</span>}
      </div>

      <div className="ot2d-meta-row">
        <span className={`ot2d-badge ${ROUTE_TONE[routeClass]}`}>{routeLabel}</span>
        {hasPdf && (
          <span className="ot2d-badge ot2d-badge--muted">
            <FileText size={12} aria-hidden /> PDF layout
          </span>
        )}
        {wireStatus === 'skipped' && <span className="ot2d-badge ot2d-badge--warn">Skipped — Pending</span>}
        {wireStatus === 'paused' && <span className="ot2d-badge ot2d-badge--paused">Paused</span>}
        {wireStatus === 'completed' && <span className="ot2d-badge ot2d-badge--ok">Completed</span>}
        {wireStatus === 'in_progress' && <span className="ot2d-badge ot2d-badge--info">In progress</span>}
      </div>

      {error && !hasPdf && <p className="ot2d-error" role="alert">{error}</p>}
      {drawingError && <p className="ot2d-error" role="alert">{drawingError}</p>}
      {(loading || drawingLoading) && !hasPdf && (
        <DwesLoadingCenter label="Loading operational twin…" className="ot2d-loading" />
      )}

      {hasPdf && drawingBlob ? (
        <div className="ot2d-drawing-stack">
          {isImageMime && !isPdfMime ? (
            <ImageDrawingBackdrop blob={drawingBlob} title={drawingName || 'Approved drawing'} />
          ) : (
            <PdfDrawingBackdrop blob={drawingBlob} title={drawingName || 'Approved drawing PDF'} />
          )}
          <ScheduleCableOverlay
            color={wireColor}
            length={wireLength}
            srcLabel={srcLabel}
            dstLabel={dstLabel}
            sno={sno}
            wireStatus={wireStatus}
            size={wireSize}
          />
        </div>
      ) : (
        <div className="ot2d-awaiting-drawing" role="status">
          <p className="ot2d-awaiting-title">Cable Digital Twin — drawing layout</p>
          <p className="ot2d-awaiting-body">
            {drawingLoading
              ? 'Loading the panel’s approved PDF drawing…'
              : 'No approved PDF drawing is available for this panel yet. Upload the GA / scheme PDF to show the real drawing under the active cable path. DWG support is secondary and not active in this view.'}
          </p>
          {/* Still show colour/length-accurate path so wiring is never grey-generic */}
          <div className="ot2d-paper-path">
            <ScheduleCableOverlay
              color={wireColor}
              length={wireLength}
              srcLabel={srcLabel}
              dstLabel={dstLabel}
              sno={sno}
              wireStatus={wireStatus}
              size={wireSize}
            />
          </div>
          <p className="ot2d-disclaimer">
            Wiring can continue from the Digital Wiring Schedule. This twin does not fabricate Engineering 3D or fake panel geometry.
          </p>
        </div>
      )}

      {payload?.disclaimer && hasPdf && (
        <p className="ot2d-disclaimer">{payload.disclaimer}</p>
      )}
    </div>
  );

  if (fullscreen) {
    return createPortal(
      <div className="ot2d-fullscreen" role="dialog" aria-modal="true" aria-label="Operational Twin full view">
        <button type="button" className="ot2d-fullscreen-close" onClick={() => setFullscreen(false)} aria-label="Close full view">
          <X size={18} /> Close
        </button>
        {viewer}
      </div>,
      document.body,
    );
  }

  return viewer;
}

/** Derive visual status from existing cable_status + panel pause state. */
export function deriveWireVisualStatus(opts: {
  src?: boolean;
  dst?: boolean;
  note?: string;
  panelStatus?: string;
}): WireVisualStatus {
  if (opts.src && opts.dst) return 'completed';
  if (opts.panelStatus === 'paused') return 'paused';
  if (/\[SKIPPED /.test(opts.note || '')) return 'skipped';
  if (opts.panelStatus === 'in_progress' || opts.src || opts.dst) return 'in_progress';
  return 'pending';
}
