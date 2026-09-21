import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { DoubleSide, TextureLoader } from 'three';
import type { Texture } from 'three';
import type { Ot3dPayload, Ot3dDevice, Ot3dWireState } from '../../../types/ot3d';
import {
  SCENE_SCALE,
  mmToWorld,
  doorHingePosition,
  doorRotationY,
  cameraFitPosition,
  prefersReducedMotion,
  type PanelMm,
} from '../../../utils/operationalTwin3dCoords';
import { DwesLoadingCenter } from '../../ui/DwesLoadingIndicator';
import {
  ENDPOINT_COLORS,
  WIRE_STATE_COLORS,
  deriveWireVisualState,
  passesLayerFilter,
  type WireLayerFilter,
  type WireVisualState,
} from '../../../utils/operationalTwin3dWireState';
import { isOperationalTwin3dReady } from '../../../utils/operationalTwinReadiness';
import {
  TWIN_NOT_READY_COPY,
  TWIN_NOT_READY_TITLE,
  TWIN_3D_UNAVAILABLE_COPY,
} from '../../../constants/twinMessaging';
import { gaApi } from '../../../services/api';
import { OT3D_QUALITY } from '../../../config/features';
import { wireColorHex, type ExtendedCableStatus } from './wiring-utils';

export interface OperationalTwin3DProps {
  payload: Ot3dPayload | null;
  loading?: boolean;
  error?: string | null;
  wireStatusesBySno?: Record<string, ExtendedCableStatus>;
  wireStatesBySno?: Record<string, WireVisualState>;
  activeSnos?: Set<string>;
  layerFilter?: WireLayerFilter;
  readOnly?: boolean;
  projectCode?: string;
  frameId?: string;
  compact?: boolean;
  currentUserId?: number;
  /** Bump when cable status changes to force canvas repaint. */
  statusRevision?: number;
}

const LAYER_OPTIONS: { id: WireLayerFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'pending', label: 'Pending' },
  { id: 'issues', label: 'Issues' },
  { id: 'my_wires', label: 'My Wires' },
];

const TABLET_QUALITY = OT3D_QUALITY === 'tablet';

function Ot3dQualitySetup() {
  const { gl } = useThree();
  useEffect(() => {
    if (!TABLET_QUALITY) return;
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  }, [gl]);
  return null;
}

function InvalidateOnChange({ revision }: { revision: number }) {
  const { invalidate } = useThree();
  useEffect(() => { invalidate(); }, [revision, invalidate]);
  return null;
}

function PanelShell({ panelMm }: { panelMm: PanelMm }) {
  const hw = panelMm.width * SCENE_SCALE;
  const hh = panelMm.height * SCENE_SCALE;
  const hd = panelMm.depth * SCENE_SCALE;
  return (
    <mesh>
      <boxGeometry args={[hw, hh, hd]} />
      <meshStandardMaterial color='#1e293b' transparent opacity={0.18} side={DoubleSide} />
    </mesh>
  );
}

function PanelEdges({ panelMm }: { panelMm: PanelMm }) {
  const w = panelMm.width * SCENE_SCALE / 2;
  const h = panelMm.height * SCENE_SCALE / 2;
  const d = panelMm.depth * SCENE_SCALE / 2;
  const corners: [number, number, number][] = [
    [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d], [-w, -h, -d],
  ];
  const rearCorners: [number, number, number][] = [
    [-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d], [-w, -h, d],
  ];
  const verticals: Array<[[number, number, number], [number, number, number]]> = [
    [[-w, -h, -d], [-w, -h, d]], [[w, -h, -d], [w, -h, d]],
    [[w, h, -d], [w, h, d]], [[-w, h, -d], [-w, h, d]],
  ];
  return (
    <>
      <Line points={corners} color='#94a3b8' lineWidth={1} />
      <Line points={rearCorners} color='#94a3b8' lineWidth={1} />
      {verticals.map((pts, i) => <Line key={i} points={pts} color='#94a3b8' lineWidth={1} />)}
    </>
  );
}

function Door({ panelMm, open, onToggle }: { panelMm: PanelMm; open: boolean; onToggle: () => void }) {
  const hw = panelMm.width * SCENE_SCALE;
  const hh = panelMm.height * SCENE_SCALE;
  const hd = 0.002;
  const reduced = prefersReducedMotion();
  const rotY = useRef(doorRotationY(open));
  const targetY = doorRotationY(open);
  useFrame((_, delta) => {
    if (reduced) { rotY.current = targetY; return; }
    rotY.current += (targetY - rotY.current) * Math.min(1, delta * 8);
  });
  const hinge = doorHingePosition(panelMm);
  return (
    <group position={hinge}>
      <group rotation={[0, rotY.current, 0]}>
        <mesh position={[hw / 2, 0, 0]} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          <boxGeometry args={[hw, hh, hd]} />
          <meshStandardMaterial color='#334155' transparent opacity={0.7} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function GaFacePlane({ faceId, face, panelMm, projectCode, frameId }: {
  faceId: string; face: string; panelMm: PanelMm; projectCode: string; frameId: string;
}) {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objUrl = '';
    gaApi.faceImage(projectCode, frameId, faceId)
      .then(blob => {
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        new TextureLoader().load(objUrl, tex => { if (!cancelled) setTexture(tex); });
      })
      .catch(() => {});
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [faceId, projectCode, frameId]);
  const w = panelMm.width * SCENE_SCALE;
  const h = panelMm.height * SCENE_SCALE;
  const zFront = -(panelMm.depth / 2) * SCENE_SCALE - 0.001;
  const zRear  =  (panelMm.depth / 2) * SCENE_SCALE + 0.001;
  const zInner = -(panelMm.depth / 2) * SCENE_SCALE + panelMm.depth * 0.1 * SCENE_SCALE;
  const z = face === 'rear' ? zRear : face === 'internal' ? zInner : zFront;
  const rotY = face === 'rear' ? Math.PI : 0;
  if (!texture) return null;
  return (
    <mesh position={[0, 0, z]} rotation={[0, rotY, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} transparent opacity={0.85} side={DoubleSide} />
    </mesh>
  );
}

function DeviceMesh({ device, panelMm }: { device: Ot3dDevice; panelMm: PanelMm }) {
  const pos = mmToWorld(device.xMm + device.widthMm / 2, device.yMm + device.heightMm / 2, 0, panelMm);
  const w = device.widthMm * SCENE_SCALE;
  const h = device.heightMm * SCENE_SCALE;
  const d = Math.max(device.depthMm, 2) * SCENE_SCALE;
  return (
    <mesh position={[pos.x, pos.y, pos.z]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color='#3b82f6' transparent opacity={0.6} />
      <Html center distanceFactor={0.4} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        <span style={{ background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 9, padding: '1px 3px', borderRadius: 3 }}>
          {device.tag}
        </span>
      </Html>
    </mesh>
  );
}

function TerminalDot({ xMm, yMm, zMm, panelMm, color }: { xMm: number; yMm: number; zMm: number; panelMm: PanelMm; color: string }) {
  const pos = mmToWorld(xMm, yMm, zMm, panelMm);
  return (
    <mesh position={[pos.x, pos.y, pos.z]}>
      <sphereGeometry args={[0.003, 6, 6]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function wireLineColor(wire: Ot3dWireState, visual: WireVisualState): string {
  if (visual === 'completed') return wireColorHex(wire.color ?? undefined).hex;
  if (visual === 'issue') return WIRE_STATE_COLORS.issue;
  if (visual === 'in_progress') return WIRE_STATE_COLORS.in_progress;
  return WIRE_STATE_COLORS.pending;
}

function WireLayer({
  wire, panelMm, visual, highlight, reduced, dashed, tabletQuality,
}: {
  wire: Ot3dWireState;
  panelMm: PanelMm;
  visual: WireVisualState;
  highlight?: boolean;
  reduced: boolean;
  dashed?: boolean;
  tabletQuality?: boolean;
}) {
  const pulse = useRef(1.0);
  useFrame(({ clock }) => {
    if (!highlight || reduced || visual !== 'in_progress') return;
    pulse.current = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 4);
  });
  const srcColor = visual === 'completed' ? ENDPOINT_COLORS.completed
    : visual === 'in_progress' ? ENDPOINT_COLORS.in_progress
    : visual === 'issue' ? ENDPOINT_COLORS.issue
    : ENDPOINT_COLORS.pending;
  const dstColor = srcColor;
  const hasBoth = wire.source.xMm != null && wire.destination.xMm != null;
  const srcPos = wire.source.xMm != null
    ? mmToWorld(wire.source.xMm, wire.source.yMm!, wire.source.zMm ?? 0, panelMm)
    : null;
  const dstPos = wire.destination.xMm != null
    ? mmToWorld(wire.destination.xMm, wire.destination.yMm!, wire.destination.zMm ?? 0, panelMm)
    : null;
  const lineColor = wireLineColor(wire, visual);
  const linePoints: [number, number, number][] = hasBoth && srcPos && dstPos
    ? [[srcPos.x, srcPos.y, srcPos.z], [dstPos.x, dstPos.y, dstPos.z]]
    : [];
  const lineWidth = (highlight ? 2.5 : visual === 'completed' ? 1.8 : 1.2) * (tabletQuality && !highlight ? 0.85 : 1);
  const useDashed = dashed ?? (visual === 'in_progress' || visual === 'pending');
  return (
    <group>
      {srcPos && <TerminalDot xMm={wire.source.xMm!} yMm={wire.source.yMm!} zMm={wire.source.zMm ?? 0} panelMm={panelMm} color={srcColor} />}
      {dstPos && <TerminalDot xMm={wire.destination.xMm!} yMm={wire.destination.yMm!} zMm={wire.destination.zMm ?? 0} panelMm={panelMm} color={dstColor} />}
      {linePoints.length === 2 && (
        <Line
          points={linePoints}
          color={lineColor}
          lineWidth={lineWidth}
          dashed={useDashed}
          dashSize={0.01}
          gapSize={0.005}
          transparent
          opacity={highlight ? 1 : visual === 'completed' ? 0.92 : 0.65}
        />
      )}
    </group>
  );
}

function PaintedWiresLayer({
  wires, panelMm, wireStatusesBySno, statusByIndex, layerFilter, activeSno, currentUserId, reduced, tabletQuality,
}: {
  wires: Ot3dWireState[];
  panelMm: PanelMm;
  wireStatusesBySno: Record<string, ExtendedCableStatus>;
  statusByIndex: Record<string, ExtendedCableStatus>;
  layerFilter: WireLayerFilter;
  activeSno: string | null;
  currentUserId?: number;
  reduced: boolean;
  tabletQuality: boolean;
}) {
  return (
    <>
      {wires.map(wire => {
        const key = String(wire.sno);
        if (key === activeSno) return null;
        const st = wireStatusesBySno[key] ?? statusByIndex[key];
        const visual = deriveWireVisualState(st);
        if (!passesLayerFilter(key, visual, st, layerFilter, currentUserId)) return null;
        if (visual === 'pending' && layerFilter !== 'all' && layerFilter !== 'pending') return null;
        if (tabletQuality && layerFilter === 'all' && visual === 'pending') return null;
        return (
          <WireLayer
            key={key}
            wire={wire}
            panelMm={panelMm}
            visual={visual}
            reduced={reduced}
            dashed={visual !== 'completed'}
            tabletQuality={tabletQuality}
          />
        );
      })}
    </>
  );
}

function SceneContent({
  payload, doorOpen, onDoorToggle, projectCode, frameId, reduced,
  wireStatusesBySno, statusByIndex, layerFilter, activeSno, currentUserId, statusRevision,
}: {
  payload: Ot3dPayload;
  doorOpen: boolean;
  onDoorToggle: () => void;
  projectCode: string;
  frameId: string;
  reduced: boolean;
  wireStatusesBySno: Record<string, ExtendedCableStatus>;
  statusByIndex: Record<string, ExtendedCableStatus>;
  layerFilter: WireLayerFilter;
  activeSno: string | null;
  currentUserId?: number;
  statusRevision: number;
}) {
  const panelMm: PanelMm = {
    height: payload.panelMm.height || 600,
    width:  payload.panelMm.width  || 400,
    depth:  payload.panelMm.depth  || 200,
  };
  const fitPos = cameraFitPosition(panelMm);
  const wires = payload.wires?.length ? payload.wires : (payload.activeWire ? [payload.activeWire] : []);
  const activeWire = payload.activeWire;
  const activeSt = activeSno ? (wireStatusesBySno[activeSno] ?? statusByIndex[activeSno]) : undefined;
  const activeVisual = deriveWireVisualState(activeSt);

  return (
    <>
      <InvalidateOnChange revision={statusRevision} />
      <Ot3dQualitySetup />
      <PerspectiveCamera makeDefault position={fitPos} fov={45} />
      <OrbitControls enableDamping dampingFactor={0.1} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[0.5, 1, 0.5]} intensity={0.8} />
      <PanelShell panelMm={panelMm} />
      <PanelEdges panelMm={panelMm} />
      <Door panelMm={panelMm} open={doorOpen} onToggle={onDoorToggle} />
      {payload.faces.map(face => (
        <GaFacePlane key={face.faceId} faceId={face.faceId} face={face.face} panelMm={panelMm} projectCode={projectCode} frameId={frameId} />
      ))}
      {payload.devices.map(device => (
        <DeviceMesh key={device.id} device={device} panelMm={panelMm} />
      ))}
      <PaintedWiresLayer
        wires={wires}
        panelMm={panelMm}
        wireStatusesBySno={wireStatusesBySno}
        statusByIndex={statusByIndex}
        layerFilter={layerFilter}
        activeSno={activeSno}
        currentUserId={currentUserId}
        reduced={reduced}
        tabletQuality={TABLET_QUALITY}
      />
      {activeWire && activeSno && passesLayerFilter(activeSno, activeVisual, activeSt, layerFilter, currentUserId) && (
        <WireLayer wire={activeWire} panelMm={panelMm} visual={activeVisual} highlight reduced={reduced} dashed={activeVisual !== 'completed'} tabletQuality={TABLET_QUALITY} />
      )}
    </>
  );
}

export default function OperationalTwin3D({
  payload, loading, error, readOnly = false, projectCode = '', frameId = '', compact,
  wireStatusesBySno = {}, layerFilter: layerFilterProp, currentUserId, statusRevision = 0,
}: OperationalTwin3DProps) {
  const [doorOpen, setDoorOpen] = useState(false);
  const [layerFilter, setLayerFilter] = useState<WireLayerFilter>(layerFilterProp ?? 'all');
  const reduced = prefersReducedMotion();
  const handleDoorToggle = useCallback(() => { if (!readOnly) setDoorOpen(v => !v); }, [readOnly]);

  const statusByIndex = useMemo(() => wireStatusesBySno, [wireStatusesBySno]);
  const activeSno = payload?.activeWire ? String(payload.activeWire.sno) : null;

  useEffect(() => {
    if (layerFilterProp) setLayerFilter(layerFilterProp);
  }, [layerFilterProp]);

  if (loading) {
    return (
      <div className="ot3d-shell ot3d-shell--loading">
        <DwesLoadingCenter label="Loading 3D Twin…" className="min-h-[12rem]" />
      </div>
    );
  }
  if (error || !payload) {
    return (
      <div className='ot3d-shell ot3d-shell--fallback'>
        <span className='ot3d-fallback-text'>
          {error || TWIN_3D_UNAVAILABLE_COPY}
        </span>
      </div>
    );
  }
  if (!isOperationalTwin3dReady(payload)) {
    return (
      <div className='ot3d-shell ot3d-shell--fallback' role='note'>
        <h4 className='ot3d-fallback-title'>{TWIN_NOT_READY_TITLE}</h4>
        <p className='ot3d-fallback-text'>{TWIN_NOT_READY_COPY}</p>
      </div>
    );
  }
  const canvasHeight = compact ? '220px' : '420px';
  return (
    <div className='ot3d-shell' style={{ height: canvasHeight, position: 'relative' }}>
      <div className='ot3d-layer-bar' role='toolbar' aria-label='Wire layer filter'>
        {LAYER_OPTIONS.map(opt => (
          <button
            key={opt.id}
            type='button'
            className={`ot3d-layer-btn${layerFilter === opt.id ? ' ot3d-layer-btn--active' : ''}`}
            onClick={() => setLayerFilter(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <Canvas frameloop='demand' gl={{ antialias: !TABLET_QUALITY }} style={{ height: '100%', width: '100%', background: '#0f172a' }}>
        <Suspense fallback={null}>
          <SceneContent
            payload={payload}
            doorOpen={doorOpen}
            onDoorToggle={handleDoorToggle}
            projectCode={projectCode}
            frameId={frameId}
            reduced={reduced}
            wireStatusesBySno={wireStatusesBySno}
            statusByIndex={statusByIndex}
            layerFilter={layerFilter}
            activeSno={activeSno}
            currentUserId={currentUserId}
            statusRevision={statusRevision}
          />
        </Suspense>
      </Canvas>
      <div className='ot3d-controls'>
        <button type='button' className='ot3d-ctrl-btn' onClick={() => setDoorOpen(v => !v)} aria-label={doorOpen ? 'Close door' : 'Open door'}>
          {doorOpen ? 'Close Door' : 'Open Door'}
        </button>
        {payload.activeWire && <span className='ot3d-route-label'>{payload.activeWire.routeLabel}</span>}
      </div>
    </div>
  );
}
