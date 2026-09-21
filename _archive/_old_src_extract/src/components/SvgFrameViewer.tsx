import { useState, useMemo, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface Cable {
  sno: string | number;
  ferrule: string;
  source: string;
  destination: string;
  color?: string;
}

interface CableStatus {
  src: boolean;
  dst: boolean;
  note: string;
}

interface SvgFrameViewerProps {
  cables: Cable[];
  cableStatus: Record<string, CableStatus>;
  currentIdx: number;
  panelName: string;
  onClose: () => void;
}

function getCableTone(index: number, cableStatus: Record<string, CableStatus>, currentIdx: number): string {
  if (index === currentIdx) return 'current';
  const st = cableStatus[String(index)];
  if (!st) return 'pending';
  if (st.src && st.dst) return 'completed';
  if (st.src || st.dst) return 'warning';
  return 'pending';
}

function getStrokeColor(tone: string): string {
  if (tone === 'current') return '#3b82f6'; // blue-500
  if (tone === 'completed') return '#22c55e'; // green-500
  if (tone === 'warning') return '#f97316'; // orange-500
  return '#64748b'; // slate-500
}

export default function SvgFrameViewer({ cables, cableStatus, currentIdx, panelName, onClose }: SvgFrameViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', preventWheel, { passive: false });
    return () => el.removeEventListener('wheel', preventWheel);
  }, []);

  const handleZoomIn = () => setTransform(p => ({ ...p, scale: Math.min(10, p.scale * 1.2) }));
  const handleZoomOut = () => setTransform(p => ({ ...p, scale: Math.max(0.1, p.scale / 1.2) }));
  const handleReset = () => setTransform({ x: 0, y: 0, scale: 1 });

  // Compute Layout (Schematic Grid)
  const layout = useMemo(() => {
    const deviceSet = new Set<string>();
    cables.forEach(c => {
      const src = (c.source || '').split(':')[0].trim();
      const dst = (c.destination || '').split(':')[0].trim();
      if (src) deviceSet.add(src);
      if (dst) deviceSet.add(dst);
    });
    
    const devices = Array.from(deviceSet).sort();
    const positions: Record<string, { x: number; y: number }> = {};
    const cols = Math.ceil(Math.sqrt(devices.length || 1));
    const spacing = 300;
    
    devices.forEach((dev, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[dev] = { x: col * spacing, y: row * spacing };
    });

    const viewBoxW = cols * spacing;
    const viewBoxH = Math.ceil(devices.length / cols) * spacing;
    const centerOffset = { x: viewBoxW / 2 - spacing / 2, y: viewBoxH / 2 - spacing / 2 };

    const wires = cables.map((cable, idx) => {
      const srcDev = (cable.source || '').split(':')[0].trim();
      const dstDev = (cable.destination || '').split(':')[0].trim();
      const p1 = positions[srcDev] || { x: 0, y: 0 };
      const p2 = positions[dstDev] || { x: 0, y: 0 };
      
      const offset = (idx % 5) * 8 - 16;
      return {
        id: idx,
        x1: p1.x + 50 + offset - centerOffset.x,
        y1: p1.y + 50 + offset - centerOffset.y,
        x2: p2.x + 50 + offset - centerOffset.x,
        y2: p2.y + 50 + offset - centerOffset.y,
        tone: getCableTone(idx, cableStatus, currentIdx)
      };
    });

    return { devices, positions, wires, centerOffset };
  }, [cables, cableStatus, currentIdx]);

  return (
    <div className="svg-frame-viewer">
      <div className="sfv-header">
        <div className="sfv-title">
          <strong>{panelName}</strong>
          <span>SVG Schematic Viewer</span>
        </div>
        <div className="sfv-controls">
          <button onClick={handleZoomOut} className="sfv-btn" type="button"><ZoomOut size={18} /></button>
          <button onClick={handleReset} className="sfv-btn" type="button"><Maximize size={18} /></button>
          <button onClick={handleZoomIn} className="sfv-btn" type="button"><ZoomIn size={18} /></button>
          <div className="sfv-divider" />
          <button onClick={onClose} className="sfv-btn sfv-close" type="button"><X size={18} /></button>
        </div>
      </div>

      <div 
        className="sfv-viewport"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div 
          className="sfv-canvas"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
        >
          <svg className="sfv-svg" overflow="visible">
            {/* Wires */}
            {layout.wires.map(w => (
              <line
                key={w.id}
                x1={w.x1} y1={w.y1}
                x2={w.x2} y2={w.y2}
                stroke={getStrokeColor(w.tone)}
                strokeWidth={w.tone === 'current' ? 4 : 2}
                opacity={w.tone === 'pending' ? 0.3 : 0.8}
                className={w.tone === 'current' ? 'sfv-wire-current' : ''}
              />
            ))}

            {/* Devices (Terminals) */}
            {layout.devices.map(dev => {
              const pos = layout.positions[dev];
              const x = pos.x - layout.centerOffset.x;
              const y = pos.y - layout.centerOffset.y;
              return (
                <g key={dev} transform={`translate(${x}, ${y})`}>
                  <rect x={0} y={0} width={100} height={100} rx={8} fill="#1e293b" stroke="#334155" strokeWidth={2} />
                  <text x={50} y={50} textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0" fontSize={14} fontWeight="600">
                    {dev.slice(0, 10)}
                  </text>
                  {/* Source / Dest nodes */}
                  <circle cx={20} cy={20} r={6} fill="#1d4ed8" /> {/* Blue for Source */}
                  <circle cx={80} cy={80} r={6} fill="#c2410c" /> {/* Orange for Dest */}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

