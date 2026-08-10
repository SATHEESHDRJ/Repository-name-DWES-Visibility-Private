// Shared types for the Live 3D Operational Twin (Phase 2-4).
// These mirror the interfaces in backend/src/engineering/operational-twin-3d.service.ts.
// Duplicated here so the frontend compilation never imports backend source.

export const SCENE_SCALE = 0.001;

export type Ot3dRouteLabel =
  | 'Approved Exact Route'
  | 'Calculated Guidance'
  | 'Endpoint Guidance'
  | 'Route Not Mapped';

export interface Ot3dFace {
  faceId: string;
  face: 'front' | 'internal' | 'rear' | 'custom';
  customLabel?: string | null;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  viewport: { width: number; height: number };
}

export interface Ot3dDevice {
  id: number;
  stableItemId: string | null;
  tag: string;
  description: string | null;
  type: string | null;
  face: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  mappingRevision: string | null;
  terminals: Ot3dTerminal[];
}

export interface Ot3dTerminal {
  id: number;
  terminalRef: string;
  xMm: number;
  yMm: number;
  zMm: number;
}

export interface Ot3dEndpointMapping {
  terminalId: number | null;
  terminalRef: string | null;
  xMm: number | null;
  yMm: number | null;
  zMm: number | null;
  confirmed: boolean;
}

export interface Ot3dWireState {
  sno: string | number;
  color?: string | null;
  size?: string | null;
  routeLabel: Ot3dRouteLabel;
  source: Ot3dEndpointMapping;
  destination: Ot3dEndpointMapping;
  routeNodes?: Array<{ x: number; y: number; z: number }>;
  guidanceNodes?: Array<{ x: number; y: number; z: number }>;
}

export interface Ot3dPayload {
  projectCode: string;
  frameId: string;
  sceneScale: number;
  panelMm: { height: number; width: number; depth: number };
  gaAssetSetId: string | null;
  gaRevision: number | null;
  mappingRevision: string | null;
  scheduleRevision: string | null;
  releaseStatus: string | null;
  faces: Ot3dFace[];
  devices: Ot3dDevice[];
  activeWire: Ot3dWireState | null;
  wires: Ot3dWireState[];
  executionBySno?: Record<string, { src: boolean; dst: boolean; issue?: boolean; note?: string; technicianId?: number }>;
  legacy: boolean;
}
