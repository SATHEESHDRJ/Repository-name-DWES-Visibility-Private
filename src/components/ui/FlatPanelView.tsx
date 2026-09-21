import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Maximize, ZoomIn, ZoomOut } from './icons';

/**
 * Flat 3D — tablet-optimized plan view of a published panel model.
 *
 * Renders ONLY real, published engineering geometry served by the twin-context
 * endpoint: panel envelope, device footprints with tags, duct runs, the selected
 * cable's source/destination markers, and the route polyline (approved or
 * calculated — the caller labels which). Pure SVG: no WebGL requirement, fast on
 * tablets, and nothing is invented — when a layer is absent it simply isn't drawn.
 *
 * Supports pinch/scroll zoom, mouse-drag pan, and fit-to-screen reset.
 */

export interface FlatDevice {
  id: number;
  tag: string;
  type?: string | null;
  x: number; y: number;
  width?: number | null;
  height?: number | null;
}

export interface FlatPoint { x: number; y: number }

export interface FlatPanelViewProps {
  panel: { width?: number | null; height?: number | null; units?: string | null };
  devices: FlatDevice[];
  ductNodes: Array<{ id: number; x: number; y: number }>;
  ductSegments: Array<{ source: number; destination: number }>;
  source?: (FlatPoint & { ref?: string | null }) | null;
  destination?: (FlatPoint & { ref?: string | null }) | null;
  route?: { type: 'approved' | 'calculated'; nodes?: FlatPoint[] | null } | null;
  cableLabel?: string;
}

const DEFAULT_DEVICE_SIZE = 60;
const MIN_SCALE = 0.3;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;

export default function FlatPanelView({
  panel, devices, ductNodes, ductSegments, source, destination, route, cableLabel,
}: FlatPanelViewProps) {
  const [showLabels, setShowLabels] = useState(true);
  const [showDucts, setShowDucts] = useState(true);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = Math.max(1, panel.width ?? 0);
  const height = Math.max(1, panel.height ?? 0);
  const pad = Math.max(width, height) * 0.05;

  const nodeById = useMemo(
    () => new Map(ductNodes.map(n => [n.id, n])),
    [ductNodes],
  );
  const routeNodes = Array.isArray(route?.nodes) ? route!.nodes!.filter(n =>
    typeof n?.x === 'number' && typeof n?.y === 'number') : [];

  if (!panel.width || !panel.height) {
    return (
      <div className="flat-panel-empty" role="note">
        The published model has no panel envelope dimensions — Flat 3D cannot be drawn.
      </div>
    );
  }

  const Y = (y: number) => height - y;
  const fontSize = Math.max(10, Math.min(width, height) * 0.02);

  const handleZoomIn = () => setScale(s => Math.min(MAX_SCALE, s * ZOOM_STEP));
  const handleZoomOut = () => setScale(s => Math.max(MIN_SCALE, s / ZOOM_STEP));
  const handleFit = () => { setScale(1); setTranslate({ x: 0, y: 0 }); };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setScale(s => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor)));
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, tx: translate.x, ty: translate.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setTranslate({ x: dragRef.current.tx + dx, y: dragRef.current.ty + dy });
  };

  const handlePointerUp = () => { dragRef.current = null; };

  return (
    <div className="flat-panel-shell">
      <div className="flat-panel-toolbar">
        <span className="flat-panel-title">
          Flat 3D — plan view {cableLabel ? `· ${cableLabel}` : ''}
        </span>
        {route && (
          <span className={`flat-panel-route-chip is-${route.type}`}>
            {route.type === 'approved' ? 'Approved Exact Route' : 'Calculated Guidance Route'}
          </span>
        )}
        <span className="flat-panel-toolbar-spacer" />
        <label className="flat-panel-toggle">
          <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Labels
        </label>
        <label className="flat-panel-toggle">
          <input type="checkbox" checked={showDucts} onChange={e => setShowDucts(e.target.checked)} /> Ducts
        </label>
        <span className="flat-panel-toolbar-divider" />
        <button type="button" className="flat-panel-zoom-btn" onClick={handleZoomOut} aria-label="Zoom out" title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <span className="flat-panel-zoom-level">{Math.round(scale * 100)}%</span>
        <button type="button" className="flat-panel-zoom-btn" onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button type="button" className="flat-panel-zoom-btn" onClick={handleFit} aria-label="Fit to screen" title="Fit to screen">
          <Maximize size={16} />
        </button>
      </div>

      <div className="flat-panel-viewport">
        <svg
          ref={svgRef}
          className="flat-panel-svg"
          viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
          role="img"
          aria-label={`Panel plan view${cableLabel ? ` for ${cableLabel}` : ''}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <g transform={`translate(${translate.x},${translate.y}) scale(${scale})`}>
            {/* Panel envelope */}
            <rect x={0} y={0} width={width} height={height} className="flat-panel-outline" />

            {/* Duct runs */}
            {showDucts && ductSegments.map((s, i) => {
              const a = nodeById.get(s.source);
              const b = nodeById.get(s.destination);
              if (!a || !b) return null;
              return (
                <line
                  key={`duct-${i}`}
                  x1={a.x} y1={Y(a.y)} x2={b.x} y2={Y(b.y)}
                  className="flat-panel-duct"
                />
              );
            })}

            {/* Devices */}
            {devices.map(d => {
              const w = d.width ?? DEFAULT_DEVICE_SIZE;
              const h = d.height ?? DEFAULT_DEVICE_SIZE;
              return (
                <g key={d.id}>
                  <rect
                    x={d.x - w / 2}
                    y={Y(d.y) - h / 2}
                    width={w}
                    height={h}
                    className="flat-panel-device"
                  >
                    <title>{d.tag}{d.type ? ` · ${d.type}` : ''}</title>
                  </rect>
                  {showLabels && (
                    <text
                      x={d.x}
                      y={Y(d.y)}
                      className="flat-panel-device-label"
                      fontSize={fontSize}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {d.tag}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Route polyline */}
            {routeNodes.length >= 2 && (
              <polyline
                points={routeNodes.map(n => `${n.x},${Y(n.y)}`).join(' ')}
                className={`flat-panel-route is-${route?.type ?? 'calculated'}`}
              />
            )}

            {/* Source / destination markers */}
            {source && (
              <g>
                <circle cx={source.x} cy={Y(source.y)} r={fontSize * 0.9} className="flat-panel-marker is-source" />
                {showLabels && (
                  <text x={source.x} y={Y(source.y) - fontSize * 1.4} className="flat-panel-marker-label is-source" fontSize={fontSize} textAnchor="middle">
                    SRC{source.ref ? ` ${source.ref}` : ''}
                  </text>
                )}
              </g>
            )}
            {destination && (
              <g>
                <circle cx={destination.x} cy={Y(destination.y)} r={fontSize * 0.9} className="flat-panel-marker is-destination" />
                {showLabels && (
                  <text x={destination.x} y={Y(destination.y) - fontSize * 1.4} className="flat-panel-marker-label is-destination" fontSize={fontSize} textAnchor="middle">
                    DST{destination.ref ? ` ${destination.ref}` : ''}
                  </text>
                )}
              </g>
            )}
          </g>
        </svg>
      </div>

      <p className="flat-panel-foot">
        {width} × {height} {panel.units || 'mm'} · {devices.length} devices
        {ductSegments.length > 0 ? ` · ${ductSegments.length} duct segments` : ' · no duct data'}
        {!route && ' · no route available for this cable'}
      </p>
    </div>
  );
}
