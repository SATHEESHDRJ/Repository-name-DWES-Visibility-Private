/**
 * Multi-evidence fusion for LIVE TB AUTO_VERIFIED HIGH.
 * Never trusts OCR / LocateAnything / OpenCV confidence alone.
 */
import type { DetectionConfidence } from './expected-headers';
import { isLocateAnythingRequired } from './live-tb-contracts';
import { isLiveTbEligibleView, isLiveTbRejectedView } from './live-tb-view-classification';

export type HeaderEvidence = {
  header: string;
  schedule?: { exact?: boolean; terminal?: string; terminals?: string[] };
  pdf_text?: { matched?: boolean };
  tesseract?: { matched?: boolean; raw?: string };
  paddleocr?: { matched?: boolean; raw?: string };
  locate_text?: { matched?: boolean; status?: string };
  locate_physical_group?: { matched?: boolean; status?: string };
  opencv_strip?: { matched?: boolean; geometry_score?: number };
  view?: {
    page?: string;
    region?: string;
    view_name?: string;
    region_kind?: string;
  };
  terminal_diagram?: { supported?: boolean };
  candidate_unique?: boolean;
  checksum_current?: boolean;
};

export type FusionDecision = {
  confidence: DetectionConfidence;
  result:
    | 'AUTO_VERIFIED'
    | 'REVIEW_REQUIRED'
    | 'UNRESOLVED'
    | 'HEADER_FOUND_ONLY_NON_PHYSICAL_REGION'
    | 'GROUNDING_UNAVAILABLE';
  reasons: string[];
};

function textEvidenceOk(ev: HeaderEvidence): boolean {
  return !!(
    ev.pdf_text?.matched
    || ev.tesseract?.matched
    || ev.paddleocr?.matched
    || ev.locate_text?.matched
  );
}

function viewEligible(ev: HeaderEvidence): boolean {
  const v = String(ev.view?.view_name || ev.view?.region || '');
  return isLiveTbEligibleView(v as any);
}

function viewRejected(ev: HeaderEvidence): boolean {
  const v = String(ev.view?.view_name || ev.view?.region || '');
  const region = String(ev.view?.region || '');
  if (region === 'LEGEND_OR_BOM' || region === 'FRONT_VIEW') return true;
  return isLiveTbRejectedView(v as any);
}

/**
 * HIGH requires strong multi-source agreement.
 * When LOCATEANYTHING_REQUIRED=1, grounding unavailable blocks HIGH.
 */
export function fuseHeaderEvidence(input: {
  evidence: HeaderEvidence;
  groundingUnavailable?: boolean;
  locateStatus?: string;
  paintablePeerCount?: number;
  hasRealBox?: boolean;
}): FusionDecision {
  const ev = input.evidence;
  const reasons: string[] = [];
  const locateRequired = isLocateAnythingRequired();

  if (
    input.groundingUnavailable
    || input.locateStatus === 'LOCATE_UNAVAILABLE'
    || input.locateStatus === 'GROUNDING_UNAVAILABLE'
  ) {
    reasons.push('GROUNDING_UNAVAILABLE — LocateAnything did not participate');
    if (locateRequired) {
      return {
        confidence: 'LOW',
        result: 'GROUNDING_UNAVAILABLE',
        reasons: [...reasons, 'LOCATEANYTHING_REQUIRED=1 blocks AUTO_VERIFIED HIGH'],
      };
    }
  }

  if (!ev.schedule?.exact) {
    return {
      confidence: 'LOW',
      result: 'UNRESOLVED',
      reasons: ['Schedule expected header not exact'],
    };
  }
  reasons.push('schedule_exact');

  if (viewRejected(ev) && !viewEligible(ev)) {
    return {
      confidence: 'LOW',
      result: 'HEADER_FOUND_ONLY_NON_PHYSICAL_REGION',
      reasons: [
        ...reasons,
        `HEADER_FOUND_ONLY_NON_PHYSICAL_REGION view=${ev.view?.view_name || ev.view?.region}`,
      ],
    };
  }

  if (!viewEligible(ev)) {
    return {
      confidence: 'MEDIUM',
      result: 'REVIEW_REQUIRED',
      reasons: [...reasons, `View not eligible for AUTO_VERIFIED: ${ev.view?.view_name}`],
    };
  }
  reasons.push('eligible_internal_or_rear_region');

  const peers = input.paintablePeerCount ?? 0;
  if (peers > 0 || ev.candidate_unique === false) {
    return {
      confidence: 'AMBIGUOUS' as DetectionConfidence,
      result: 'REVIEW_REQUIRED',
      reasons: [...reasons, `Multiple paintable physical candidates (${peers + 1}) — never guess`],
    };
  }
  reasons.push('candidate_unique');

  if (ev.checksum_current === false) {
    return {
      confidence: 'LOW',
      result: 'UNRESOLVED',
      reasons: [...reasons, 'Drawing checksum not current'],
    };
  }
  reasons.push('checksum_current');

  if (!input.hasRealBox) {
    return {
      confidence: 'MEDIUM',
      result: 'REVIEW_REQUIRED',
      reasons: [...reasons, 'No real physical bbox — never invent coordinates'],
    };
  }

  const locatePhys = !!ev.locate_physical_group?.matched;
  const opencv = !!ev.opencv_strip?.matched;
  const textOk = textEvidenceOk(ev);

  if (locateRequired && !locatePhys) {
    reasons.push('locate_physical_group required but not matched');
    return {
      confidence: 'MEDIUM',
      result: 'REVIEW_REQUIRED',
      reasons,
    };
  }

  if (locatePhys) reasons.push('locate_physical_group_match');
  if (opencv) reasons.push('physical_strip_geometry');
  if (textOk) reasons.push('text_or_ocr_or_locate_text_match');
  if (ev.terminal_diagram?.supported) reasons.push('terminal_diagram_supporting');

  // Strict HIGH: schedule + eligible + unique + checksum + box + opencv + text,
  // and locate_physical when required (or when available and matched).
  // (unique/checksum already gated above via early returns)
  const high =
    viewEligible(ev)
    && !!input.hasRealBox
    && opencv
    && textOk
    && (!locateRequired || locatePhys)
    && !input.groundingUnavailable;

  if (high) {
    return {
      confidence: 'HIGH',
      result: 'AUTO_VERIFIED',
      reasons,
    };
  }

  if (textOk || opencv || locatePhys) {
    return {
      confidence: 'MEDIUM',
      result: 'REVIEW_REQUIRED',
      reasons: [...reasons, 'Partial evidence — Supervisor verification required'],
    };
  }

  return {
    confidence: 'LOW',
    result: 'UNRESOLVED',
    reasons: [...reasons, 'Insufficient independent evidence'],
  };
}

export function buildAnalyseOnceCacheKey(input: {
  drawingChecksum: string;
  locateModelRevision?: string;
  ocrVersions?: string;
  renderSettings?: string;
  pipelineVersion: string;
}): string {
  return [
    input.drawingChecksum || '',
    input.locateModelRevision || 'no-locate',
    input.ocrVersions || 'tesseract',
    input.renderSettings || 'dpi350',
    input.pipelineVersion,
  ].join('|');
}

/**
 * Future grounding cache identity (local helper — no cloud Redis required now).
 * drawing_checksum | page | tile | expected_header | model_revision |
 * pipeline_version | generation_mode
 */
export function buildGroundingCacheKey(input: {
  drawingChecksum: string;
  page: number | string;
  tile: string;
  expectedHeader: string;
  modelRevision?: string;
  pipelineVersion?: string;
  generationMode?: string;
}): string {
  return [
    input.drawingChecksum || '',
    String(input.page ?? ''),
    input.tile || '',
    String(input.expectedHeader || '').toUpperCase(),
    input.modelRevision || 'no-locate',
    input.pipelineVersion || 'max-accuracy-evidence-fusion-v1',
    input.generationMode || 'hybrid',
  ].join('|');
}

/** Domain drawing identity — project/frame/slot/revision/checksum (never OS paths). */
export function buildDrawingIdentity(input: {
  projectCode: string;
  frameId: string;
  slot?: string;
  revision?: string;
  checksum?: string;
}): {
  project_code: string;
  frame_id: string;
  slot: string;
  revision: string;
  checksum: string;
} {
  return {
    project_code: String(input.projectCode || '').trim(),
    frame_id: String(input.frameId || '').trim(),
    slot: String(input.slot || '2d').trim() || '2d',
    revision: String(input.revision || '').trim(),
    checksum: String(input.checksum || '').trim().toLowerCase(),
  };
}

/** Analysis job stage names (future queue-compatible; no new infra in this task). */
export const LIVE_TB_JOB_STAGES = {
  GA_ANALYSIS: 'GA_ANALYSIS',
  OCR_ANALYSIS: 'OCR_ANALYSIS',
  VISUAL_GROUNDING: 'VISUAL_GROUNDING',
  EVIDENCE_FUSION: 'EVIDENCE_FUSION',
} as const;
