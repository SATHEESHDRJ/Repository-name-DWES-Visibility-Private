/**
 * Phase 9B — pure DEVICE location analysis for 2D GA drawings.
 *
 * GA REFERENCE vs PHYSICAL LAYOUT:
 * - Reference / description / type tables = semantic evidence only (WHAT).
 * - Physical GA views = final geometry only (WHERE).
 * - Schedule equipment tag is primary physicalIdentity; model/type supports only.
 * - Never persist reference-table row geometry as LIVE TB location.
 *
 * Logical endpointType (DEVICE / DEVICE_TERMINAL) stays schedule semantics.
 * Physical persistence stores DEVICE body geometry only (ga_device_locations).
 * Future locatorKind (TERMINAL_GROUP / EQUIPMENT_ZONE) is documented but not
 * persisted in Phase 9B — schema redesign deferred.
 *
 * Never treats equipment tags as TB_GROUP and never writes 3D CAD tables.
 */
import {
  classifyLiveTbEndpoint,
  normalizeDeviceName,
} from '../tb-markers/terminal-range';
import { isLocateAnythingRequired } from '../drawing-tb-analysis/live-tb-contracts';
import type { GaDeviceLocationInput } from './ga-device-locations.repository';

export type NormBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DeviceEvidenceRole = 'semantic_reference' | 'physical_geometry';

/** Drawing hit supplied by DI / tests (generic — no per-device offsets). */
export type DeviceDrawingHit = {
  device_identity: string;
  page: number;
  /** Page-level view class (FRONT_VIEW, INTERNAL_VIEW, LEGEND_OR_BOM, …). */
  page_view: string;
  /**
   * Region kind near the hit:
   * physical_device_body | equipment_label | legend_or_table | description_table |
   * device_reference_table | reference_table | device_list | title_block | notes | bom | unknown
   */
  region_kind: string;
  /** Tag text bbox alone is NOT a device body. */
  tag_bbox?: NormBbox | null;
  /** Associated physical DEVICE body (required to persist). */
  body_bbox?: NormBbox | null;
  /** Model/type text that strengthens identity (never primary physicalIdentity). */
  supporting_model?: string | null;
  /** Explicit role: semantic tables never supply final geometry. */
  evidence_role?: DeviceEvidenceRole | null;
  detection_method: string;
  confidence_score?: number;
  drawing_checksum: string;
};

export type DeviceTarget = {
  physicalIdentity: string;
  endpointType: 'DEVICE' | 'DEVICE_TERMINAL';
  terminalReference: string;
};

export type DevicePersistDecision =
  | {
      action: 'persist';
      input: GaDeviceLocationInput;
      verification: 'AUTO_VERIFIED' | 'BLOCKED_GROUNDING' | 'UNVERIFIED';
      reason: string;
    }
  | {
      action: 'reject';
      reason: string;
      device_identity: string;
    }
  | {
      action: 'ambiguous';
      reason: string;
      device_identity: string;
      candidates: number;
    };

export type DeviceAnalysisMetrics = {
  device_targets_requested: number;
  device_targets_found: number;
  device_candidates: number;
  device_locations_ready_for_persistence: number;
  device_locations_persisted: number;
  device_blocked_grounding: number;
  device_ambiguous: number;
  device_unresolved: number;
  real_postgresql_ga_device_locations_write_verified: false;
  device_persistence_contract: 'service_with_repository_boundary';
};

const PHYSICAL_PAGE_VIEWS = new Set([
  'FRONT_VIEW',
  'INTERNAL_VIEW',
  'REAR_VIEW',
  'REAR_WIRING_VIEW',
  'SIDE_VIEW',
  'EQUIPMENT_MOUNTING_VIEW',
  'PHYSICAL_DEVICE',
  'EQUIPMENT_LAYOUT',
]);

const REJECT_REGIONS = new Set([
  'bom',
  'legend',
  'legend_or_table',
  'description_table',
  'device_reference_table',
  'reference_table',
  'device_list',
  'title_block',
  'notes',
  'drawing_note',
]);

const REJECT_PAGE_VIEWS = new Set([
  'LEGEND_OR_BOM',
  'TITLE_BLOCK',
  'NOTES',
  'SCHEMATIC',
  'TERMINAL_DIAGRAM',
]);

export function collectDeviceTargetsFromCables(
  cables: Array<{
    source_device?: string | null;
    source_terminal?: string | null;
    dest_device?: string | null;
    dest_terminal?: string | null;
    _raw?: Record<string, unknown> | null;
  }>,
): DeviceTarget[] {
  const out = new Map<string, DeviceTarget>();
  for (const c of cables || []) {
    const raw = c._raw || {};
    const ends: Array<{ header: string; terminal: string }> = [
      {
        header: String(raw.DEV_TBLK_A ?? c.source_device ?? '').trim(),
        terminal: String(raw.TERM_A ?? c.source_terminal ?? '').trim(),
      },
      {
        header: String(raw.DEV_TBLK_B ?? c.dest_device ?? '').trim(),
        terminal: String(raw.TERM_B ?? c.dest_terminal ?? '').trim(),
      },
    ];
    for (const end of ends) {
      if (!end.header) continue;
      const cls = classifyLiveTbEndpoint(end.header, end.terminal);
      if (cls.endpointType !== 'DEVICE' && cls.endpointType !== 'DEVICE_TERMINAL') continue;
      const id = normalizeDeviceName(cls.physicalLookupKey || cls.equipmentTag || end.header);
      if (!id) continue;
      if (!out.has(id)) {
        out.set(id, {
          physicalIdentity: id,
          endpointType: cls.endpointType,
          terminalReference: cls.terminalReference || end.terminal,
        });
      }
    }
  }
  return [...out.values()];
}

/** True when SRC and DST schedule identities refer to one physical device body. */
export function samePhysicalDeviceEntity(
  srcIdentity: string | null | undefined,
  dstIdentity: string | null | undefined,
): boolean {
  const a = normalizeDeviceName(srcIdentity);
  const b = normalizeDeviceName(dstIdentity);
  return !!a && !!b && a === b;
}

/** Stable persist key for one shared DEVICE body (SRC+DST same tag). */
export function buildSharedDevicePersistKey(deviceIdentity: string): string {
  return normalizeDeviceName(deviceIdentity);
}

function isSemanticReferenceHit(hit: DeviceDrawingHit): boolean {
  if (hit.evidence_role === 'semantic_reference') return true;
  if (hit.evidence_role === 'physical_geometry') return false;
  return isRejectedNonphysicalHit(hit);
}

export function isRejectedNonphysicalHit(hit: DeviceDrawingHit): boolean {
  const region = String(hit.region_kind || '').toLowerCase().replace(/\s+/g, '_');
  const page = String(hit.page_view || '').toUpperCase();
  if (REJECT_REGIONS.has(region)) return true;
  if (REJECT_PAGE_VIEWS.has(page) && region !== 'physical_device_body') return true;
  if (page === 'LEGEND_OR_BOM') return true;
  return false;
}

export function isPhysicalDeviceContext(hit: DeviceDrawingHit): boolean {
  if (isRejectedNonphysicalHit(hit)) return false;
  if (hit.evidence_role === 'semantic_reference') return false;
  const region = String(hit.region_kind || '').toLowerCase().replace(/\s+/g, '_');
  const page = String(hit.page_view || '').toUpperCase();
  if (region === 'physical_device_body') return true;
  if (region === 'equipment_label' && PHYSICAL_PAGE_VIEWS.has(page)) {
    // Label alone is not enough — body required separately.
    return false;
  }
  return false;
}

export function normalizeFullPageBbox(box: NormBbox | null | undefined): NormBbox | null {
  if (!box) return null;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0) return null;
  if (x > 1 || y > 1) return null;
  if (x + width > 1.0001 || y + height > 1.0001) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1 - x, width)),
    height: Math.max(0, Math.min(1 - y, height)),
  };
}

/**
 * Keep only hits that may represent the schedule equipment tag.
 * Model/type labels alone never replace the schedule tag identity.
 */
export function filterHitsForScheduleDevice(
  scheduleIdentity: string,
  hits: DeviceDrawingHit[],
): DeviceDrawingHit[] {
  const id = normalizeDeviceName(scheduleIdentity);
  if (!id) return [];
  return (hits || []).filter((h) => {
    const hitId = normalizeDeviceName(h.device_identity);
    if (hitId === id) return true;
    // Model-as-identity hits are ignored for persist selection when schedule tag differs.
    return false;
  });
}

export function rankDeviceHits(
  hits: DeviceDrawingHit[],
  scheduleIdentity?: string,
): DeviceDrawingHit[] {
  const id = normalizeDeviceName(scheduleIdentity);
  return [...hits].sort((a, b) => {
    if (id) {
      const aExact = normalizeDeviceName(a.device_identity) === id ? 1 : 0;
      const bExact = normalizeDeviceName(b.device_identity) === id ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      const aModel = a.supporting_model ? 1 : 0;
      const bModel = b.supporting_model ? 1 : 0;
      if (bModel !== aModel) return bModel - aModel;
    }
    const ca = Number(a.confidence_score ?? 0);
    const cb = Number(b.confidence_score ?? 0);
    if (cb !== ca) return cb - ca;
    return Number(a.page) - Number(b.page);
  });
}

function pageViewAllowsPhysical(page: string): boolean {
  const p = String(page || '').toUpperCase();
  if (REJECT_PAGE_VIEWS.has(p)) return false;
  if (PHYSICAL_PAGE_VIEWS.has(p) || p === 'UNKNOWN') return true;
  if (/^SIDE/.test(p)) return true;
  return false;
}

/**
 * Decide persistence for one device identity given all hits on the current drawing.
 */
export function decideDevicePersistence(input: {
  device_identity: string;
  hits: DeviceDrawingHit[];
  currentDrawingChecksum: string;
  drawing_id: number;
  analysis_run_id: string;
  pipeline_version: string;
  groundingUnavailable: boolean;
}): DevicePersistDecision {
  const id = normalizeDeviceName(input.device_identity);
  const checksum = String(input.currentDrawingChecksum || '').trim();

  // Tag-over-model: only consider hits whose device_identity matches schedule tag.
  const taggedHits = filterHitsForScheduleDevice(id, input.hits || []);

  const currentHits = taggedHits.filter(
    (h) => String(h.drawing_checksum || '').trim() === checksum,
  );

  if (!currentHits.length) {
    const modelOnlyPhysical = (input.hits || []).some((h) => {
      if (normalizeDeviceName(h.device_identity) === id) return false;
      if (String(h.drawing_checksum || '').trim() !== checksum) return false;
      if (isRejectedNonphysicalHit(h) || isSemanticReferenceHit(h)) return false;
      const region = String(h.region_kind || '').toLowerCase();
      return region === 'physical_device_body' && !!normalizeFullPageBbox(h.body_bbox || undefined);
    });
    const staleOnly = (input.hits || []).some(
      (h) =>
        normalizeDeviceName(h.device_identity) === id
        && String(h.drawing_checksum || '').trim()
        && String(h.drawing_checksum || '').trim() !== checksum,
    );
    const refOnly = (input.hits || []).some(
      (h) =>
        normalizeDeviceName(h.device_identity) === id
        && String(h.drawing_checksum || '').trim() === checksum
        && isSemanticReferenceHit(h),
    );
    return {
      action: 'reject',
      reason: staleOnly
        ? 'stale_drawing_checksum'
        : modelOnlyPhysical
          ? 'model_without_tag_match'
          : refOnly
            ? 'reference_table_only'
            : 'no_hits',
      device_identity: id,
    };
  }

  const withBody = currentHits.filter((h) => {
    if (isRejectedNonphysicalHit(h) || isSemanticReferenceHit(h)) return false;
    const region = String(h.region_kind || '').toLowerCase().replace(/\s+/g, '_');
    if (region !== 'physical_device_body') return false;
    if (!pageViewAllowsPhysical(h.page_view)) return false;
    return !!normalizeFullPageBbox(h.body_bbox || undefined);
  });

  const physical = currentHits.filter((h) => {
    if (isRejectedNonphysicalHit(h) || isSemanticReferenceHit(h)) return false;
    if (!isPhysicalDeviceContext(h) && String(h.region_kind).toLowerCase() !== 'physical_device_body') {
      return false;
    }
    return !!normalizeFullPageBbox(h.body_bbox || undefined);
  });

  const eligible = withBody.length ? withBody : physical;

  if (!eligible.length) {
    const tagOnly = currentHits.some(
      (h) =>
        !isRejectedNonphysicalHit(h)
        && !isSemanticReferenceHit(h)
        && normalizeFullPageBbox(h.tag_bbox || undefined)
        && !normalizeFullPageBbox(h.body_bbox || undefined),
    );
    const refOnly = currentHits.every((h) => isSemanticReferenceHit(h) || isRejectedNonphysicalHit(h));
    return {
      action: 'reject',
      reason: tagOnly
        ? 'tag_without_physical_body'
        : refOnly
          ? 'reference_table_only'
          : 'nonphysical_or_invalid',
      device_identity: id,
    };
  }

  const ranked = rankDeviceHits(eligible, id);
  const best = ranked[0];
  const bestScore = Number(best.confidence_score ?? 0);
  const tied = ranked.filter(
    (h) =>
      Number(h.confidence_score ?? 0) === bestScore
      && Number(h.page) === Number(best.page),
  );
  // Multiple distinct bodies on same page with equal confidence → ambiguous
  if (tied.length > 1) {
    const boxes = new Set(
      tied.map((h) => {
        const b = normalizeFullPageBbox(h.body_bbox!);
        return b ? `${b.x},${b.y},${b.width},${b.height}` : '';
      }),
    );
    if (boxes.size > 1) {
      return {
        action: 'ambiguous',
        reason: 'multiple_equal_physical_candidates',
        device_identity: id,
        candidates: tied.length,
      };
    }
  }

  const bbox = normalizeFullPageBbox(best.body_bbox!);
  if (!bbox) {
    return {
      action: 'reject',
      reason: 'invalid_normalized_bbox',
      device_identity: id,
    };
  }

  const locateRequired = isLocateAnythingRequired();
  const blockAuto =
    locateRequired && input.groundingUnavailable;

  const verification: 'AUTO_VERIFIED' | 'BLOCKED_GROUNDING' | 'UNVERIFIED' = blockAuto
    ? 'BLOCKED_GROUNDING'
    : locateRequired && !input.groundingUnavailable
      ? 'AUTO_VERIFIED'
      : !locateRequired
        ? 'AUTO_VERIFIED'
        : 'UNVERIFIED';

  return {
    action: 'persist',
    reason: blockAuto ? 'physical_device_grounding_blocked' : 'physical_device_ready',
    verification,
    input: {
      drawing_id: input.drawing_id,
      drawing_checksum: checksum,
      device_identity: id,
      page: Number(best.page) || 1,
      view_classification: String(best.page_view || 'UNKNOWN').toUpperCase(),
      geometry_bbox_x: bbox.x,
      geometry_bbox_y: bbox.y,
      geometry_bbox_width: bbox.width,
      geometry_bbox_height: bbox.height,
      analysis_run_id: input.analysis_run_id,
      pipeline_version: input.pipeline_version,
      confidence_score: best.confidence_score,
      detection_method: best.detection_method,
      candidates_total: ranked.length,
      rank_position: 1,
    },
  };
}

export function emptyDeviceMetrics(): DeviceAnalysisMetrics {
  return {
    device_targets_requested: 0,
    device_targets_found: 0,
    device_candidates: 0,
    device_locations_ready_for_persistence: 0,
    device_locations_persisted: 0,
    device_blocked_grounding: 0,
    device_ambiguous: 0,
    device_unresolved: 0,
    real_postgresql_ga_device_locations_write_verified: false,
    device_persistence_contract: 'service_with_repository_boundary',
  };
}

export function analyseDeviceLocations(input: {
  cables: Parameters<typeof collectDeviceTargetsFromCables>[0];
  hits: DeviceDrawingHit[];
  currentDrawingChecksum: string;
  drawing_id: number;
  analysis_run_id: string;
  pipeline_version: string;
  groundingUnavailable: boolean;
}): {
  metrics: DeviceAnalysisMetrics;
  decisions: DevicePersistDecision[];
} {
  const targets = collectDeviceTargetsFromCables(input.cables);
  const decisions: DevicePersistDecision[] = [];
  const metrics = emptyDeviceMetrics();
  metrics.device_targets_requested = targets.length;
  metrics.device_candidates = (input.hits || []).length;

  for (const t of targets) {
    const d = decideDevicePersistence({
      device_identity: t.physicalIdentity,
      hits: input.hits,
      currentDrawingChecksum: input.currentDrawingChecksum,
      drawing_id: input.drawing_id,
      analysis_run_id: input.analysis_run_id,
      pipeline_version: input.pipeline_version,
      groundingUnavailable: input.groundingUnavailable,
    });
    decisions.push(d);
    if (d.action === 'persist') {
      metrics.device_targets_found += 1;
      metrics.device_locations_ready_for_persistence += 1;
      if (d.verification === 'BLOCKED_GROUNDING') metrics.device_blocked_grounding += 1;
    } else if (d.action === 'ambiguous') {
      metrics.device_ambiguous += 1;
      metrics.device_unresolved += 1;
    } else {
      metrics.device_unresolved += 1;
    }
  }

  return { metrics, decisions };
}
