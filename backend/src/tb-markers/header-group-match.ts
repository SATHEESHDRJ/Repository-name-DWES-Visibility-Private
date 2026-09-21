/**
 * HEADER GROUP MATCH — Pure helpers for LIVE ENDPOINT VIEW highlight.
 *
 * Extracted so node:test can run without Nest DI.
 * All functions are synchronous + deterministic.
 */

import { normalizeDeviceName, isPhysicalTbHeader, classifyEndpointV2 } from './terminal-range';
import type { EndpointKind, EndpointClassificationV2 } from './terminal-range';
import { resolveHeaderGroupGeometry, readViewClassification } from './terminal-cell-geometry';
import type { ManualEndpointMapping } from './manual-endpoint-mapping.service';
import { isLiveTbEligibleView, isLiveTbRejectedView } from '../drawing-tb-analysis/live-tb-view-classification';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type HeaderGroupCandidate = {
  id: number;
  tb_number: string;
  terminal_group: string;
  page_number: number;
  view_name?: string | null;
  notes?: string | null;
  geometry: any;
  matched_terminal?: string | null;
  view_classification?: string | null;
  detection_method?: string | null;
  marker_type?: string | null;
  paint_mode: 'header_group';
};

export type HeaderGroupDiagnostics = {
  document?: string | null;
  page?: number | null;
  matched_label?: string | null;
  group_bbox?: { x: number; y: number; width: number; height: number } | null;
  confidence?: string | null;
  rejected_candidates?: Array<{ label?: string; reason: string; page?: number }>;
};

export type SelectResult = {
  best: HeaderGroupCandidate | null;
  /** All physical matches for Match 1 of N navigation (never silently drop peers). */
  candidates: HeaderGroupCandidate[];
  unmatched: boolean;
  reason: string;
  rejection?: string;
  diagnostics: HeaderGroupDiagnostics;
};

const MULTI_MATCH_VIEW_RANK: Record<string, number> = {
  INTERNAL_VIEW: 0,
  REAR_WIRING_VIEW: 1,
  PHYSICAL_TB_BANK: 2,
  PHYSICAL_DEVICE: 3,
  FRONT_VIEW: 4,
};

/** Prefer eligible physical views when presenting Match 1 of N. */
export function rankHeaderGroupCandidates(
  candidates: HeaderGroupCandidate[],
): HeaderGroupCandidate[] {
  return [...candidates].sort((a, b) => {
    const ra = MULTI_MATCH_VIEW_RANK[String(a.view_classification || '').toUpperCase()] ?? 50;
    const rb = MULTI_MATCH_VIEW_RANK[String(b.view_classification || '').toUpperCase()] ?? 50;
    if (ra !== rb) return ra - rb;
    return (a.page_number || 0) - (b.page_number || 0) || a.id - b.id;
  });
}

/* ── Candidate builder ────────────────────────────────────────────────────── */

/**
 * Build a HeaderGroupCandidate from a DB marker row.
 * Primary paint is ALWAYS from resolveHeaderGroupGeometry (or marker geom);
 * terminal_cells kept as evidence only. paint_mode forced to 'header_group'.
 */
export function asCandidateHeaderGroup(marker: any, terminal: string): HeaderGroupCandidate {
  const view = readViewClassification(marker.geometry, marker.view_name);
  const headerBox = resolveHeaderGroupGeometry(marker.geometry);
  const strip = marker.geometry && typeof marker.geometry === 'object' ? marker.geometry : null;
  const paintBox = headerBox;
  const geometry = paintBox
    ? {
        ...paintBox,
        strip_bbox: headerBox || {
          x: Number(strip?.x) || 0,
          y: Number(strip?.y) || 0,
          width: Number(strip?.width) || 0,
          height: Number(strip?.height) || 0,
        },
        view_classification: view,
        terminal_cells: strip?.terminal_cells,
        tb_header: marker.tb_number,
        target_terminal: terminal,
        paint_mode: 'header_group' as const,
      }
    : {
        x: Number(strip?.x) || 0,
        y: Number(strip?.y) || 0,
        width: Number(strip?.width) || 0,
        height: Number(strip?.height) || 0,
        rotation: Number(strip?.rotation) || 0,
        view_classification: view,
        terminal_cells: strip?.terminal_cells,
        tb_header: marker.tb_number,
        target_terminal: terminal,
        paint_mode: 'header_group' as const,
      };

  return {
    id: marker.id,
    marker_type: marker.marker_type,
    tb_number: marker.tb_number,
    terminal_group: marker.terminal_group,
    page_number: marker.page_number,
    view_name: marker.view_name,
    notes: marker.notes,
    geometry,
    matched_terminal: terminal || null,
    view_classification: view,
    detection_method: marker.detection_method || null,
    paint_mode: 'header_group',
  };
}

/* ── Unique-or-fail selector ──────────────────────────────────────────────── */

/**
 * Select header/group candidates for LIVE paint.
 * - Exactly 1 → paint that match.
 * - 0         → unmatched.
 * - >1        → Match 1 of N: return all candidates, best = preferred view (never silent single pick).
 */
export function selectUniqueHeaderGroup(
  candidates: HeaderGroupCandidate[],
  role: 'source' | 'destination',
  deviceLabel: string,
): SelectResult {
  const label = role === 'source' ? 'Source' : 'Destination';

  if (candidates.length === 0) {
    return {
      best: null,
      candidates: [],
      unmatched: true,
      reason: `Header group not found: no marker for ${label} "${deviceLabel}".`,
      diagnostics: {
        matched_label: null,
        group_bbox: null,
        confidence: 'NONE',
        rejected_candidates: [],
      },
    };
  }

  const regionRejected = candidates.filter(c => isLiveTbRejectedView(c.view_classification));
  const eligible = candidates.filter(c => isLiveTbEligibleView(c.view_classification));
  const rejectedNotes = regionRejected.map(peer => ({
    label: peer.tb_number,
    reason: `rejected ineligible region view=${peer.view_classification || '—'} page=${peer.page_number}`,
    page: peer.page_number,
  }));

  if (eligible.length === 0) {
    return {
      best: null,
      candidates: [],
      unmatched: true,
      reason: `Header group not found: no eligible physical region for ${label} "${deviceLabel}" (directory/BOM/FRONT rejected).`,
      diagnostics: {
        matched_label: null,
        group_bbox: null,
        confidence: 'NONE',
        rejected_candidates: rejectedNotes,
      },
    };
  }

  const ranked = rankHeaderGroupCandidates(eligible);
  const c = ranked[0];
  const bbox = c.geometry?.strip_bbox || c.geometry;
  const multi = ranked.length > 1;

  return {
    best: c,
    candidates: ranked,
    unmatched: false,
    reason: multi
      ? `Match 1 of ${ranked.length} for ${label} "${deviceLabel}" (preferred ${c.view_classification || 'view'} page ${c.page_number}). Use Previous/Next to review peers.`
      : `Matched ${label} header group ${c.tb_number} on ${c.view_classification || 'view'} page ${c.page_number}.`,
    rejection: multi ? 'multiple_matches' : undefined,
    diagnostics: {
      page: c.page_number,
      matched_label: c.tb_number,
      group_bbox: bbox ? { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height } : null,
      confidence: multi ? 'MEDIUM' : 'HIGH',
      rejected_candidates: [
        ...rejectedNotes,
        ...(multi
          ? ranked.slice(1).map(peer => ({
              label: peer.tb_number,
              reason: `peer candidate id=${peer.id} page=${peer.page_number} view=${peer.view_classification || '—'}`,
              page: peer.page_number,
            }))
          : []),
      ],
    },
  };
}

/* ── Equipment lookup helpers ─────────────────────────────────────────────── */

/**
 * For EQUIPMENT_CONNECTOR (e.g. 87STUB + X420:2):
 * Prefer unique marker whose tb_number matches connector (X420) OR
 * combined (87STUB/X420, 87STUB:X420) with parent context;
 * else unique parent equipment tag (87STUB).
 * NEVER match X420 as TB_GROUP standalone when schedule parent is equipment.
 */
export function findEquipmentConnectorCandidates(
  markers: HeaderGroupCandidate[],
  parentEquipment: string,
  connector: string,
): HeaderGroupCandidate[] {
  const normParent = normalizeDeviceName(parentEquipment);
  const normConn = normalizeDeviceName(connector);

  // Try combined: "87STUB/X420" or "87STUB:X420" or "87STUB_X420"
  const combined = markers.filter(m => {
    const norm = normalizeDeviceName(m.tb_number);
    return norm === `${normParent}/${normConn}`
      || norm === `${normParent}:${normConn}`
      || norm === `${normParent}_${normConn}`
      || norm === `${normParent}${normConn}`;
  });
  if (combined.length === 1) return combined;

  // Try connector tag itself BUT only if it's NOT a physical TB header
  // (never match X420 as TB_GROUP when parent is equipment)
  if (!isPhysicalTbHeader(normConn)) {
    const connMatch = markers.filter(m => normalizeDeviceName(m.tb_number) === normConn);
    if (connMatch.length === 1) return connMatch;
  }

  // Fall back to parent equipment tag
  const parentMatch = markers.filter(m => normalizeDeviceName(m.tb_number) === normParent);
  if (parentMatch.length === 1) return parentMatch;

  return parentMatch;
}

/**
 * For EQUIPMENT_TERMINAL (e.g. QDC1/4):
 * Unique marker tb_number === QDC1; ignore pin for paint.
 */
export function findEquipmentTerminalCandidates(
  markers: HeaderGroupCandidate[],
  parentEquipment: string,
): HeaderGroupCandidate[] {
  const norm = normalizeDeviceName(parentEquipment);
  return markers.filter(m => normalizeDeviceName(m.tb_number) === norm);
}

/* ── Manual mapping → synthetic candidate ─────────────────────────────────── */

let syntheticIdCounter = -1;

/**
 * Convert a ManualEndpointMapping to a synthetic HeaderGroupCandidate.
 */
export function manualMapToCandidate(
  map: ManualEndpointMapping,
  terminal: string,
): HeaderGroupCandidate {
  const id = syntheticIdCounter--;
  // EQUIPMENT_* kinds paint as DEVICE footprints; TB_TERMINAL as TB_GROUP.
  const isDevice =
    map.endpoint_kind === 'EQUIPMENT_CONNECTOR'
    || map.endpoint_kind === 'EQUIPMENT_TERMINAL';
  const notesUpper = String(map.notes || '').toUpperCase();
  let deviceView = 'PHYSICAL_DEVICE';
  if (/\bFRONT\b/.test(notesUpper)) {
    // FRONT elevation/layout is never auto-eligible for LIVE paint.
    deviceView = 'FRONT_VIEW';
  } else if (/\bREAR\b/.test(notesUpper)) {
    deviceView = 'REAR_WIRING_VIEW';
  } else if (/\bINTERNAL\b/.test(notesUpper)) {
    deviceView = 'INTERNAL_VIEW';
  }
  return {
    id,
    tb_number: map.identity_tag,
    terminal_group: map.connector || '',
    page_number: map.page_number,
    view_name: null,
    notes: map.notes,
    geometry: {
      x: map.geometry.x,
      y: map.geometry.y,
      width: map.geometry.width,
      height: map.geometry.height,
      strip_bbox: {
        x: map.geometry.x,
        y: map.geometry.y,
        width: map.geometry.width,
        height: map.geometry.height,
      },
      paint_mode: 'header_group' as const,
      tb_header: map.identity_tag,
      target_terminal: terminal,
    },
    matched_terminal: terminal || null,
    // Verified physical-device layout is eligible for DEVICE paint.
    view_classification: isDevice ? deviceView : 'INTERNAL_VIEW',
    detection_method: 'MANUAL_MAP',
    marker_type: isDevice ? 'DEVICE' : 'TB_GROUP',
    paint_mode: 'header_group',
  };
}

/**
 * Search manual maps for a matching endpoint and return synthetic candidates.
 */
export function findManualMapCandidates(
  maps: ManualEndpointMapping[],
  identityTag: string,
  connector: string | null,
  endpointKind: EndpointKind,
  terminal: string,
): HeaderGroupCandidate[] {
  const normTag = normalizeDeviceName(identityTag);
  if (!normTag) return [];

  const candidates = maps.filter(m => {
    if (normalizeDeviceName(m.identity_tag) !== normTag) return false;
    if (endpointKind === 'EQUIPMENT_CONNECTOR' && connector) {
      const normMapConn = m.connector ? normalizeDeviceName(m.connector) : null;
      const normConn = normalizeDeviceName(connector);
      if (normMapConn && normMapConn !== normConn) return false;
    }
    return true;
  });

  return candidates.map(m => manualMapToCandidate(m, terminal));
}

/**
 * Resolve an endpoint (either TB or equipment) through the header-group
 * matching pipeline. Returns a SelectResult.
 */
export function resolveEndpointHeaderGroup(
  classification: EndpointClassificationV2,
  dbCandidates: HeaderGroupCandidate[],
  manualMaps: ManualEndpointMapping[],
  terminal: string,
  role: 'source' | 'destination',
): SelectResult {
  const deviceLabel = classification.physicalLookupKey
    || classification.parentEquipment
    || classification.tbHeader
    || '—';

  // 1. Check manual maps first — prefer exact identity_tag (+ connector)
  const manualCandidates = findManualMapCandidates(
    manualMaps,
    deviceLabel,
    classification.connector,
    classification.kind,
    terminal,
  );
  if (manualCandidates.length >= 1) {
    return selectUniqueHeaderGroup(manualCandidates, role, deviceLabel);
  }

  // 2. For EQUIPMENT_CONNECTOR: specialized lookup
  if (classification.kind === 'EQUIPMENT_CONNECTOR' && classification.parentEquipment && classification.connector) {
    const eqCandidates = findEquipmentConnectorCandidates(
      dbCandidates,
      classification.parentEquipment,
      classification.connector,
    );
    return selectUniqueHeaderGroup(eqCandidates, role, deviceLabel);
  }

  // 3. For EQUIPMENT_TERMINAL: lookup by parent equipment
  if (classification.kind === 'EQUIPMENT_TERMINAL' && classification.parentEquipment) {
    const eqCandidates = findEquipmentTerminalCandidates(
      dbCandidates,
      classification.parentEquipment,
    );
    return selectUniqueHeaderGroup(eqCandidates, role, deviceLabel);
  }

  // 4. For TB_TERMINAL: existing TB header path but header_group paint only
  if (classification.kind === 'TB_TERMINAL' && classification.tbHeader) {
    const normTb = normalizeDeviceName(classification.tbHeader);
    const tbCandidates = dbCandidates.filter(
      c => normalizeDeviceName(c.tb_number) === normTb,
    );
    return selectUniqueHeaderGroup(tbCandidates, role, deviceLabel);
  }

  // 5. Fallback for unknown: try physicalLookupKey
  if (classification.physicalLookupKey) {
    const normKey = normalizeDeviceName(classification.physicalLookupKey);
    const fallback = dbCandidates.filter(
      c => normalizeDeviceName(c.tb_number) === normKey,
    );
    return selectUniqueHeaderGroup(fallback, role, deviceLabel);
  }

  return {
    best: null,
    candidates: [],
    unmatched: true,
    reason: `Header group not found: no physical lookup key for ${role}.`,
    diagnostics: {
      matched_label: null,
      group_bbox: null,
      confidence: 'NONE',
      rejected_candidates: [],
    },
  };
}
