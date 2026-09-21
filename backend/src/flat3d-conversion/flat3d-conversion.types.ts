// flat3d-conversion.types.ts
// Shared types for the Flat 3D drawing conversion pipeline.
// Stage identifiers mirror the Python flat3d.cli pipeline stages.

export type Flat3dStage =
  | 'INGEST'
  | 'DWG_TO_DXF'
  | 'DXF_PARSE'
  | 'GEOMETRY_NORMALIZATION'
  | 'SEMANTIC_EXTRACTION'
  | 'SCHEDULE_MATCHING'
  | 'FLAT_3D_GENERATION'
  | 'GLB_EXPORT'
  | 'GLB_VALIDATION'
  | 'BROWSER_VERIFICATION'
  | 'READY_FOR_REVIEW'
  | 'FAILED';

export const FLAT3D_STAGES: Flat3dStage[] = [
  'INGEST', 'DWG_TO_DXF', 'DXF_PARSE', 'GEOMETRY_NORMALIZATION',
  'SEMANTIC_EXTRACTION', 'SCHEDULE_MATCHING', 'FLAT_3D_GENERATION',
  'GLB_EXPORT', 'GLB_VALIDATION', 'BROWSER_VERIFICATION', 'READY_FOR_REVIEW', 'FAILED',
];

export type Flat3dConfidence = 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'REVIEW_REQUIRED' | 'UNRESOLVED';

export interface Flat3dConversionOptions {
  projectCode: string;
  frameId: string;
  sourceFilePath: string;
  originalName: string;
  scheduleJsonPath?: string;
  skipGltfValidator?: boolean;
  /** Drawing package revision the conversion is generated from — recorded in report/manifest for diagnose provenance. */
  drawingRevision?: number | string;
}

export interface Flat3dScheduleEntry {
  cable_ref?: string;
  source_device?: string;
  source_terminal?: string;
  dest_device?: string;
  dest_terminal?: string;
  ferrule?: string;
  color?: string;
  size?: string;
  path?: string;
}

export interface Flat3dStageEvent {
  stage: Flat3dStage;
  at: string;
  detail?: string;
}

export interface Flat3dOverlay {
  matched_device_pct?: number;
  missing_devices?: string[];
  positional_deviation_mm?: number;
}

export interface Flat3dConversionResult {
  status: 'READY_FOR_REVIEW' | 'FAILED';
  runId: string;
  runDir: string;
  glbBuffer?: Buffer;
  glbFilename?: string;
  stages: Flat3dStageEvent[];
  overlay?: Flat3dOverlay;
  notes: string[];
  fallback?: 'APPROVED_2D_ONLY';
  failureReason?: string;
}

export interface Flat3dRunMeta {
  runId: string;
  runDir: string;
  status: 'READY_FOR_REVIEW' | 'FAILED';
  stages: Flat3dStageEvent[];
  overlay?: Flat3dOverlay;
  notes: string[];
  fallback?: 'APPROVED_2D_ONLY';
  failureReason?: string;
  createdAt: string;
}
