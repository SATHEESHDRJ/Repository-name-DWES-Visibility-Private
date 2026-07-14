export type PanelModelStatus =
  | 'drawing_uploaded'
  | 'analysing'
  | 'extracting_dimensions'
  | 'identifying_components'
  | 'generating_model'
  | 'verification_required'
  | 'approved'
  | 'conversion_failed'
  | 'superseded';

export interface PanelModelDimension {
  value_mm: number | null;
  source: 'extracted' | 'manual' | 'supervisor_verified' | 'placeholder';
  confidence: number;
}

export interface PanelModelComponent {
  id: string;
  label: string;
  type: string;
  source: 'extracted' | 'manual';
  position: 'placeholder' | 'manual';
}

export interface PanelModelSpec {
  enclosure: { width: PanelModelDimension; height: PanelModelDimension; depth: PanelModelDimension };
  doors: { count: number; source: string };
  mounting_plate: { present: boolean; source: string };
  gland_plate: { present: boolean; source: string };
  base_frame: { present: boolean; height_mm: number; source: string };
  wire_troughs: { count: number; source: string };
  terminal_rows: { count: number; source: string };
  components: PanelModelComponent[];
}

export interface PanelModelStageEvent {
  stage: PanelModelStatus;
  at: string;
  detail?: string;
}

export interface PanelModelSourceRef {
  drawing_id: string;
  original_name: string;
  sha256: string;
  role: string;
  package_revision: number;
}

export interface PanelGeneratedModel {
  id: string;
  project_code: string;
  frame_id: string;
  panel_name: string;
  panel_type?: string;
  revision: number;
  status: PanelModelStatus;
  status_message?: string;
  stages: PanelModelStageEvent[];
  sources: PanelModelSourceRef[];
  source_package_revision: number;
  views_detected: string[];
  extraction: { text_quality: number; confidence: number; notes: string[] };
  analysis?: {
    ga_detected: boolean;
    ga_pages: number[];
    ga_confidence: number;
    drawing_references: string[];
    schedule_comparison: {
      schedule_rows: number;
      matched_references: string[];
      schedule_only_references: string[];
      drawing_only_references: string[];
      status: string;
    };
  };
  spec: PanelModelSpec;
  placeholders: string[];
  model_file: { filename: string; content_type: string; size: number; sha256: string } | null;
  created_at: string;
  updated_at: string;
  converted_by: number;
  converted_by_name: string;
  conversion_started_at: string;
  conversion_completed_at: string | null;
  verified_by: number | null;
  verified_by_name: string;
  approved_at: string | null;
  superseded_by: string | null;
  superseded_at: string | null;
  manual_entry?: {
    entered_by: number;
    entered_by_name: string;
    entered_at: string;
    source: 'supervisor_verified_manual';
    prior_automatic_confidence: number;
    corrected_from_model_id: string;
    corrected_from_revision: number;
    verification_notes?: string;
  } | null;
  verification_notes?: string;
  assumptions_acknowledged?: boolean;
  assumptions_acknowledged_by?: number | null;
  assumptions_acknowledged_by_name?: string;
  assumptions_acknowledged_at?: string | null;
  superseded_from_status?: PanelModelStatus;
  superseded_status_message?: string;
}

export interface PanelModelSpecPatchRequest {
  package_revision: number;
  enclosure: {
    width_mm: number;
    height_mm: number;
    depth_mm: number;
  };
  doors?: { count: number };
  mounting_plate?: { present: boolean };
  gland_plate?: { present: boolean };
  base_frame?: { present: boolean; height_mm?: number };
  wire_troughs?: { count: number };
  terminal_rows?: { count: number };
  components?: Array<{ label: string; type: string }>;
  verification_notes?: string;
}

export interface PanelModelView {
  project_code: string;
  frame_id: string;
  panel_name: string;
  panel_type: string | null;
  package_revision: number;
  has_drawing_2d: boolean;
  panel_status: PanelModelStatus | 'no_drawing';
  current: PanelGeneratedModel | null;
  history: PanelGeneratedModel[];
  permissions: {
    can_convert: boolean;
    can_correct: boolean;
    can_approve: boolean;
  };
}

export const PANEL_MODEL_STATUS_LABELS: Record<PanelModelStatus | 'no_drawing', string> = {
  no_drawing: 'No Drawing',
  drawing_uploaded: 'Drawing Uploaded',
  analysing: 'Analysing',
  extracting_dimensions: 'Extracting Dimensions',
  identifying_components: 'Identifying Components',
  generating_model: 'Generating 3D Model',
  verification_required: 'Verification Required',
  approved: 'Approved',
  conversion_failed: 'Conversion Failed',
  superseded: 'Superseded by New Revision',
};
