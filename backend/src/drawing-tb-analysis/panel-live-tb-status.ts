/**
 * Derive Supervisor panel LIVE TB status and nine-gate diagnostic.
 */
import type {
  LiveTbFailedStage,
  LiveTbGateId,
  LiveTbGateState,
  LiveTbPanelStatus,
} from './live-tb-contracts';

export type GateReport = {
  gate: LiveTbGateId;
  state: LiveTbGateState;
  evidence: Record<string, unknown>;
  failed_stage: LiveTbFailedStage;
};

export function derivePanelLiveTbStatus(input: {
  analysisStatus?: string | null;
  scheduleDrawingMismatch?: boolean;
  hasUsableTbGroups?: boolean;
  needsSupervisorVerification?: boolean;
  technicalFailure?: boolean;
  failedStage?: LiveTbFailedStage | null;
}): { panel_status: LiveTbPanelStatus; failed_stage: LiveTbFailedStage } {
  const st = String(input.analysisStatus || '').toUpperCase();
  const inProgress = [
    'ANALYSIS_PENDING',
    'ANALYSING',
    'ENRICHMENT_RETRY',
    'UPLOADED',
    'REANALYSIS_REQUIRED',
  ].includes(st);

  if (inProgress) {
    return { panel_status: 'ANALYSIS_IN_PROGRESS', failed_stage: 'none' };
  }
  // Schedule/drawing mismatch always wins over marker presence (incl. DEV_BASELINE).
  // Baseline markers may still paint via match, but panel status must stay honest.
  if (input.scheduleDrawingMismatch || st === 'SCHEDULE_DRAWING_MISMATCH') {
    return {
      panel_status: 'SCHEDULE_DRAWING_MISMATCH',
      failed_stage: 'excel_ga_cross_verification',
    };
  }
  // READY only when usable current-checksum TB_GROUP locations exist.
  if (input.hasUsableTbGroups) {
    return { panel_status: 'READY_FOR_LIVE_TB', failed_stage: 'none' };
  }
  if (input.needsSupervisorVerification || st === 'SUPERVISOR_VERIFICATION_REQUIRED') {
    return {
      panel_status: 'SUPERVISOR_VERIFICATION_REQUIRED',
      failed_stage: input.failedStage || 'physical_strip_detection',
    };
  }
  if (input.technicalFailure || st === 'TECHNICAL_FAILURE') {
    return {
      panel_status: 'TECHNICAL_FAILURE',
      failed_stage: input.failedStage || 'worker_startup',
    };
  }
  // Legacy DETECTION_FAILED without usable groups: map by cause, never leave bare.
  if (st === 'DETECTION_FAILED') {
    if (input.scheduleDrawingMismatch) {
      return {
        panel_status: 'SCHEDULE_DRAWING_MISMATCH',
        failed_stage: 'excel_ga_cross_verification',
      };
    }
    return {
      panel_status: 'SUPERVISOR_VERIFICATION_REQUIRED',
      failed_stage: input.failedStage || 'physical_strip_detection',
    };
  }
  if (st === 'READY_FOR_LIVE_TB' || st === 'PARTIAL_DETECTION') {
    return {
      panel_status: 'SUPERVISOR_VERIFICATION_REQUIRED',
      failed_stage: 'marker_persistence',
    };
  }
  return {
    panel_status: 'TECHNICAL_FAILURE',
    failed_stage: input.failedStage || 'analysis_job_creation',
  };
}

export function buildNineGateReport(input: {
  hasSchedulePhysicalTb?: boolean;
  hasGa2d?: boolean;
  checksum?: string | null;
  readinessImplemented?: boolean;
  readinessType?: string | null;
  textExtractionOk?: boolean;
  ocrAvailable?: boolean;
  physicalStripFound?: boolean;
  crossVerifyOk?: boolean;
  crossVerifyModulePresent?: boolean;
  usableMarkers?: number;
  matchPathExists?: boolean;
  overlayPathExists?: boolean;
}): GateReport[] {
  const g = (
    gate: LiveTbGateId,
    state: LiveTbGateState,
    evidence: Record<string, unknown>,
    failed_stage: LiveTbFailedStage = 'none',
  ): GateReport => ({ gate, state, evidence, failed_stage });

  return [
    g(
      'G1_schedule_resolution',
      input.hasSchedulePhysicalTb ? 'PASS' : 'FAIL',
      { has_physical_tb: !!input.hasSchedulePhysicalTb },
      input.hasSchedulePhysicalTb ? 'none' : 'schedule_field_resolution',
    ),
    g(
      'G2_ga_identity',
      input.hasGa2d && input.checksum ? 'PASS' : 'FAIL',
      { has_ga: !!input.hasGa2d, checksum: input.checksum || null },
      input.hasGa2d ? 'none' : 'drawing_lookup',
    ),
    g(
      'G3_document_classification',
      input.readinessImplemented ? 'PASS' : 'NOT_IMPLEMENTED',
      { readiness: input.readinessType || null },
      input.readinessImplemented ? 'none' : 'pdf_reading',
    ),
    g(
      'G4_text_ocr_extraction',
      input.textExtractionOk
        ? 'PASS'
        : input.ocrAvailable
          ? 'PASS'
          : 'BLOCKED',
      {
        text_ok: !!input.textExtractionOk,
        ocr_available: !!input.ocrAvailable,
      },
      input.textExtractionOk || input.ocrAvailable ? 'none' : 'ocr',
    ),
    g(
      'G5_physical_tb_geometry',
      input.physicalStripFound ? 'PASS' : 'FAIL',
      { physical_strip_found: !!input.physicalStripFound },
      input.physicalStripFound ? 'none' : 'physical_strip_detection',
    ),
    g(
      'G6_excel_ga_cross_verify',
      !input.crossVerifyModulePresent
        ? 'BLOCKED'
        : input.crossVerifyOk
          ? 'PASS'
          : 'FAIL',
      {
        module_present: !!input.crossVerifyModulePresent,
        cross_verify_ok: !!input.crossVerifyOk,
      },
      !input.crossVerifyModulePresent
        ? 'worker_startup'
        : input.crossVerifyOk
          ? 'none'
          : 'excel_ga_cross_verification',
    ),
    g(
      'G7_marker_persistence',
      (input.usableMarkers || 0) > 0 ? 'PASS' : 'FAIL',
      { usable_markers: input.usableMarkers || 0 },
      (input.usableMarkers || 0) > 0 ? 'none' : 'marker_persistence',
    ),
    g(
      'G8_match_api',
      input.matchPathExists ? 'PASS' : 'NOT_IMPLEMENTED',
      { match_path: !!input.matchPathExists },
      input.matchPathExists ? 'none' : 'match_api',
    ),
    g(
      'G9_overlay_rendering',
      input.overlayPathExists
        ? (input.usableMarkers || 0) > 0
          ? 'PASS'
          : 'BLOCKED'
        : 'NOT_IMPLEMENTED',
      {
        overlay_path: !!input.overlayPathExists,
        usable_markers: input.usableMarkers || 0,
      },
      input.overlayPathExists ? 'none' : 'overlay_rendering',
    ),
  ];
}
