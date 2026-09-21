import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

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
}

interface PanelView3DProps {
  cables: Cable[];
  cableStatus: Record<string, CableStatus>;
  panelName: string;
}

function wireColor(index: number, cableStatus: Record<string, CableStatus>): string {
  const status = cableStatus[String(index)];
  if (!status) return '#7c8798';
  if (status.src && status.dst) return '#2f9e68';
  if (status.src || status.dst) return '#d97706';
  return '#7c8798';
}

function TerminalBlock({ position, label, color }: { position: [number, number, number]; label: string; color: string }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.35, 0.12, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
      </mesh>
      <Text position={[0, 0.1, 0]} fontSize={0.065} color="#f4f7fb" anchorX="center" anchorY="middle" maxWidth={0.3}>
        {label}
      </Text>
    </group>
  );
}

function Device({ position, label, w, h, d }: { position: [number, number, number]; label: string; w?: number; h?: number; d?: number }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[w || 0.7, h || 0.5, d || 0.35]} />
        <meshStandardMaterial color="#224766" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, (d || 0.35) / 2 + 0.001]}>
        <planeGeometry args={[(w || 0.7) * 0.9, (h || 0.5) * 0.8]} />
        <meshStandardMaterial color="#16314c" roughness={0.8} />
      </mesh>
      <Text
        position={[0, 0, (d || 0.35) / 2 + 0.01]}
        fontSize={0.07}
        color="#dbe8ff"
        anchorX="center"
        anchorY="middle"
        maxWidth={(w || 0.7) * 0.85}
      >
        {label}
      </Text>
    </group>
  );
}

function Wire({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const points = useMemo(() => {
    const midY = Math.max(from[1], to[1]) + 0.3;
    const mid: [number, number, number] = [(from[0] + to[0]) / 2, midY, (from[2] + to[2]) / 2];
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...to),
    );
    return curve.getPoints(20);
  }, [from, to]);

  return <Line points={points} color={color} lineWidth={1.5} transparent opacity={0.9} />;
}

function PanelScene({ cables, cableStatus }: { cables: Cable[]; cableStatus: Record<string, CableStatus> }) {
  const devices = useMemo(() => {
    const deviceSet = new Set<string>();
    cables.forEach(cable => {
      const sourceDevice = (cable.source || '').split(':')[0].trim();
      const destinationDevice = (cable.destination || '').split(':')[0].trim();
      if (sourceDevice) deviceSet.add(sourceDevice);
      if (destinationDevice) deviceSet.add(destinationDevice);
    });
    return Array.from(deviceSet).slice(0, 12);
  }, [cables]);

  const devicePosition = useMemo(() => {
    const positions: Record<string, [number, number, number]> = {};
    const cols = Math.ceil(Math.sqrt(devices.length || 1));
    devices.forEach((device, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions[device] = [col * 1.2 - (cols - 1) * 0.6, 1.0 - row * 0.8, 0.1];
    });
    return positions;
  }, [devices]);

  const terminalPosition = useMemo(() => {
    const positions: Record<string, [number, number, number]> = {};
    devices.forEach(device => {
      const panelPosition = devicePosition[device];
      if (panelPosition) positions[device] = [panelPosition[0], panelPosition[1] - 0.6, panelPosition[2] + 0.05];
    });
    return positions;
  }, [devicePosition, devices]);

  const wires = useMemo(() => {
    return cables.slice(0, 60).map((cable, index) => {
      const sourceDevice = (cable.source || '').split(':')[0].trim();
      const destinationDevice = (cable.destination || '').split(':')[0].trim();
      const from = terminalPosition[sourceDevice] || [0, -1.5, 0.15];
      const to = terminalPosition[destinationDevice] || [0, -1.5, 0.15];
      const offset = (index % 5) * 0.05;

      return {
        from: [from[0], from[1] - 0.06 - offset, from[2]] as [number, number, number],
        to: [to[0], to[1] - 0.06 - offset, to[2]] as [number, number, number],
        color: wireColor(index, cableStatus),
        key: String(cable.sno || index),
      };
    });
  }, [cableStatus, cables, terminalPosition]);

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 8, 5]} intensity={0.85} castShadow />
      <pointLight position={[-4, 3, 3]} intensity={0.38} color="#8fbcff" />

      <mesh position={[0, 0, -0.15]}>
        <boxGeometry args={[5.5, 4.2, 0.08]} />
        <meshStandardMaterial color="#16314c" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.15]}>
        <boxGeometry args={[5.7, 4.4, 0.04]} />
        <meshStandardMaterial color="#6b89a6" roughness={0.4} metalness={0.7} wireframe={false} />
      </mesh>

      {devices.map(device => {
        const position = devicePosition[device];
        if (!position) return null;
        return <Device key={device} position={position} label={device} />;
      })}

      {devices.map((device, index) => {
        const position = terminalPosition[device];
        if (!position) return null;
        return (
          <TerminalBlock
            key={`tb_${device}`}
            position={position}
            label={device.slice(0, 5)}
            color={index % 2 === 0 ? '#456683' : '#224766'}
          />
        );
      })}

      {wires.map(wire => (
        <Wire key={wire.key} from={wire.from} to={wire.to} color={wire.color} />
      ))}

      <mesh position={[0, -1.8, 0.05]}>
        <boxGeometry args={[5, 0.06, 0.06]} />
        <meshStandardMaterial color="#b8c6d4" roughness={0.3} metalness={0.9} />
      </mesh>
    </>
  );
}

function Legend() {
  const items = [
    { tone: 'completed', label: 'Completed' },
    { tone: 'warning', label: 'One End Open' },
    { tone: 'pending', label: 'Pending' },
  ];

  return (
    <div className="panel-3d-legend">
      {items.map(item => (
        <div key={item.label} className="panel-3d-pill">
          <span className="panel-3d-dot" data-tone={item.tone} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function StatsOverlay({ cables, cableStatus }: { cables: Cable[]; cableStatus: Record<string, CableStatus> }) {
  const done = cables.filter((_, index) => {
    const status = cableStatus[String(index)];
    return status?.src && status?.dst;
  }).length;
  const partial = cables.filter((_, index) => {
    const status = cableStatus[String(index)];
    return (status?.src || status?.dst) && !(status?.src && status?.dst);
  }).length;
  const pending = cables.length - done - partial;

  return (
    <div className="panel-3d-stats">
      {[
        { value: done, label: 'Done', tone: 'completed' },
        { value: partial, label: 'Open', tone: 'warning' },
        { value: pending, label: 'Pending', tone: 'pending' },
      ].map(item => (
        <div key={item.label} className="panel-3d-pill">
          <strong data-tone={item.tone}>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function PanelView3D({ cables, cableStatus, panelName }: PanelView3DProps) {
  if (cables.length === 0) {
    return (
      <div className="dwes-empty-state">
        <div className="dwes-empty-title">No wiring data loaded</div>
        <div className="dwes-empty-copy">
          Select an in-progress panel to see its 3D wiring visualization.
        </div>
      </div>
    );
  }

  return (
    <div className="panel-3d-shell">
      <div className="panel-3d-title">
        <strong>{panelName}</strong>
        <span>orbit · scroll to zoom · two-finger pan</span>
      </div>

      <StatsOverlay cables={cables} cableStatus={cableStatus} />

      <Canvas
        className="panel-3d-canvas"
        camera={{ position: [0, 0, 7], fov: 45 }}
        shadows
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => { gl.setClearColor('#0f2234'); }}
      >
        <PanelScene cables={cables} cableStatus={cableStatus} />
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={16}
          maxPolarAngle={Math.PI * 0.85}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </Canvas>

      <Legend />
    </div>
  );
}
