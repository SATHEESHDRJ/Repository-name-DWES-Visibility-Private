/**
 * LIVE TB contracts — universal for every project/panel.
 *
 * Schedule → classifyLiveTbEndpoint / resolvePhysicalTbEnd / resolveLiveTbWireEnds
 * (DEVICE ends never promote embedded TERM X* into expected TB headers).
 * GA = project_code + frame_id → slot `2d` only (checksum/revision).
 * Technician paint: AUTO_VERIFIED or Supervisor-confirmed TB_GROUP only.
 */
export const LIVE_TB_SLOT = '2d' as const;

/** Pipeline version baked into analyse-once cache key. */
export const LIVE_TB_PIPELINE_VERSION = 'max-accuracy-evidence-fusion-v1';

/** Explicit maximum-accuracy pipeline stages (Nest + worker). */
export type LiveTbPipelineStage =
  | 'QUEUED'
  | 'PDF_TEXT'
  | 'PAGE_RENDER'
  | 'OCR'
  | 'LOCATE_TEXT'
  | 'LOCATE_PHYSICAL'
  | 'OPENCV'
  | 'VIEW_CLASSIFICATION'
  | 'EVIDENCE_FUSION'
  | 'PERSIST'
  | 'COMPLETE';

/** LocateAnything participation states — mandatory when render succeeds. */
export type LocateAnythingStatus =
  | 'LOCATE_RUNNING'
  | 'LOCATE_COMPLETE'
  | 'LOCATE_FAILED'
  | 'LOCATE_UNAVAILABLE';

/** Supervisor-facing panel LIVE TB status (exactly one). */
export type LiveTbPanelStatus =
  | 'READY_FOR_LIVE_TB'
  | 'ANALYSIS_IN_PROGRESS'
  | 'SUPERVISOR_VERIFICATION_REQUIRED'
  | 'SCHEDULE_DRAWING_MISMATCH'
  | 'TECHNICAL_FAILURE';

/** Per-header / cross-verify outcome. */
export type LiveTbHeaderResult =
  | 'AUTO_VERIFIED'
  | 'REVIEW_REQUIRED'
  | 'UNRESOLVED'
  | 'AMBIGUOUS'
  | 'SCHEDULE_DRAWING_MISMATCH'
  | 'TECHNICAL_FAILURE';

export type LiveTbDebugVerdict =
  | 'A_SCHEDULE_DRAWING_MISMATCH'
  | 'B_DETECTION_PIPELINE_DEFECT'
  | 'C_MARKER_PERSISTENCE_OR_MATCH_DEFECT'
  | 'D_OVERLAY_RENDERING_DEFECT'
  | 'E_DATA_CONFIGURATION_ISSUE'
  | 'F_EXPECTED_SAFE_FAILURE';

export type LiveTbFailedStage =
  | 'schedule_field_resolution'
  | 'drawing_lookup'
  | 'analysis_job_creation'
  | 'worker_startup'
  | 'pdf_reading'
  | 'page_rendering'
  | 'ocr'
  | 'locate_text'
  | 'locate_physical'
  | 'grounding_unavailable'
  | 'header_matching'
  | 'terminal_matching'
  | 'physical_strip_detection'
  | 'excel_ga_cross_verification'
  | 'evidence_fusion'
  | 'legend_rejection'
  | 'view_rejection'
  | 'marker_persistence'
  | 'revision_checksum_filtering'
  | 'match_api'
  | 'page_selection'
  | 'overlay_rendering'
  | 'queue'
  | 'none';

export type LiveTbGateId =
  | 'G1_schedule_resolution'
  | 'G2_ga_identity'
  | 'G3_document_classification'
  | 'G4_text_ocr_extraction'
  | 'G5_physical_tb_geometry'
  | 'G6_excel_ga_cross_verify'
  | 'G7_marker_persistence'
  | 'G8_match_api'
  | 'G9_overlay_rendering';

export type LiveTbGateState = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_IMPLEMENTED';

export type DrawingReadinessType =
  | 'SEARCHABLE_VECTOR_PDF'
  | 'VECTOR_PDF_WITH_OUTLINED_TEXT'
  | 'FLATTENED_PDF'
  | 'SCANNED_PDF'
  | 'IMAGE'
  | 'MIXED'
  | 'UNSUPPORTED';

/** Technician-safe banner keys (never TECHNICAL_FAILURE). */
export type LiveTbTechnicianBanner =
  | 'PAINT_OK'
  | 'ANALYSIS_IN_PROGRESS'
  | 'SUPERVISOR_VERIFICATION_REQUIRED'
  | 'SCHEDULE_DRAWING_MISMATCH'
  | 'NO_GA'
  | 'EMPTY_WIRE'
  | 'NONE';

export const TECHNICIAN_BANNER_COPY: Record<
  Exclude<LiveTbTechnicianBanner, 'PAINT_OK' | 'NONE'>,
  string
> = {
  ANALYSIS_IN_PROGRESS: 'Automatic TB-location analysis is in progress for this panel.',
  SUPERVISOR_VERIFICATION_REQUIRED: 'The TB location is awaiting Supervisor verification.',
  SCHEDULE_DRAWING_MISMATCH:
    'The TB listed in the wiring schedule was not found in the assigned panel GA drawing.',
  NO_GA: 'GA drawing is not available for this assigned panel.',
  EMPTY_WIRE: 'No active wire is available. Start or resume a wire to view its TB location.',
};

/** Forbidden as the normal Technician LIVE TB result. */
export const FORBIDDEN_TECHNICIAN_TECHNICAL_MESSAGE =
  'Automatic TB-location analysis could not be completed for this drawing.';

/** True when local acceptance requires LocateAnything readiness. */
export function isLocateAnythingRequired(): boolean {
  return String(process.env.LOCATEANYTHING_REQUIRED || '').trim() === '1';
}
