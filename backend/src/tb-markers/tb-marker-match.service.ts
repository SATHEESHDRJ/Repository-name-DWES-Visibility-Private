import { Injectable } from '@nestjs/common';
import type { User } from '../data/mock-store';
import { assertTechnicianAssignedToFrame } from '../common/technician-panel-access.helper';
import { PrismaService } from '../prisma/prisma.service';
import {
  isPhysicalTbHeader,
  normalizeDeviceName,
  parseTerminalRange,
  isTerminalInRange,
} from './terminal-range';
import {
  readViewClassification,
  resolveHeaderGroupGeometry,
  resolveTerminalCellGeometry,
} from './terminal-cell-geometry';
import {
  isLiveTbEligibleView,
  isLiveTbRejectedView,
} from '../drawing-tb-analysis/live-tb-view-classification';
import { resolvePhysicalParent, type EndpointResolution, type GaMarker } from './endpoint-resolution';
import { classifyEndpointV2, type EndpointKind, type EndpointClassificationV2 } from './terminal-range';
import { GaDeviceLocationsService } from '../ga-device-locations/ga-device-locations.service';
import { ManualEndpointMappingService } from './manual-endpoint-mapping.service';
import {
  asCandidateHeaderGroup,
  selectUniqueHeaderGroup,
  resolveEndpointHeaderGroup,
  type HeaderGroupCandidate,
  type HeaderGroupDiagnostics,
  type SelectResult,
} from './header-group-match';

export type TbMarkerType = 'SOURCE_GROUP' | 'DESTINATION_GROUP' | 'TB_GROUP';

export type TbMarkerMatchCandidate = {
  id: number;
  marker_type: TbMarkerType;
  tb_number: string;
  terminal_group: string;
  page_number: number;
  view_name?: string | null;
  notes?: string | null;
  geometry: any;
  matched_terminal?: string | null;
  view_classification?: string | null;
  detection_method?: string | null;
};

export type TbMarkerMatchResponse = {
  source_marker_candidates: TbMarkerMatchCandidate[];
  destination_marker_candidates: TbMarkerMatchCandidate[];
  best_source: TbMarkerMatchCandidate | null;
  best_destination: TbMarkerMatchCandidate | null;
  source_unmatched: boolean;
  destination_unmatched: boolean;
  source_match_reason: string;
  destination_match_reason: string;
  source_candidate_count: number;
  destination_candidate_count: number;
  drawing_checksum_applied: string | null;
  superseded_excluded: number;
  source_rejection_reasons?: string[];
  destination_rejection_reasons?: string[];
  /** True when both ends resolve to the same physical TB group (same marker id, or same tb+page+geom). */
  same_physical_group: boolean;
  
  // PHASE 5: Generic endpoint resolution metadata
  source_resolution?: {
    endpoint_type?: string;          // TB_GROUP | DEVICE | DEVICE_TERMINAL | UNKNOWN
    physical_identity?: string;      // X9 or 87STUB
    terminal_reference?: string;     // 15 or X329:18
    location_granularity?: string;   // TB_GROUP | DEVICE | UNRESOLVED
    status?: string;                 // VERIFIED | UNRESOLVED
    confidence?: string;             // HIGH | MEDIUM | LOW | NONE
  };
  destination_resolution?: {
    endpoint_type?: string;
    physical_identity?: string;
    terminal_reference?: string;
    location_granularity?: string;
    status?: string;
    confidence?: string;
  };
  // V2 Tranche 2: typed endpoint kinds
  source_endpoint_kind?: EndpointKind;
  destination_endpoint_kind?: EndpointKind;
  // V2 Tranche 2: diagnostics (supervisor-only rejected candidate reasons)
  diagnostics?: {
    source_rejected_reasons?: string[];
    destination_rejected_reasons?: string[];
    source_classification?: EndpointClassificationV2;
    destination_classification?: EndpointClassificationV2;
  };
  // Header group highlight diagnostics
  source_header_group_diagnostics?: HeaderGroupDiagnostics;
  destination_header_group_diagnostics?: HeaderGroupDiagnostics;
};

type MatchEndpoint = {
  device: string;
  terminal: string;
};

type MatchKind = 'exact' | 'range' | 'header';

/**
 * Build a match candidate with ALWAYS header_group paint mode.
 * Terminal cells are evidence only — never primary paint.
 */
function asCandidate(marker: any, terminal: string): TbMarkerMatchCandidate {
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
        paint_mode: 'header_group',
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
        paint_mode: 'header_group',
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
  };
}

/**
 * Classify terminal vs marker range. Unverified/empty/named-unknown groups
 * still count as header-level match (LIVE TB paints the TB group, not the cell).
 */
function classifyTerminalMatch(terminal: string, terminalGroup: string): MatchKind {
  const raw = String(terminalGroup || '').trim();
  if (!raw || /^UNVERIFIED$/i.test(raw) || raw === '-' || raw === '?') {
    return 'header';
  }
  const parsed = parseTerminalRange(terminalGroup);
  if (parsed.type === 'single' && isTerminalInRange(terminal, parsed)) return 'exact';
  if ((parsed.type === 'numeric_range' || parsed.type === 'alpha_range') && isTerminalInRange(terminal, parsed)) {
    return 'range';
  }
  if (parsed.type === 'named' && isTerminalInRange(terminal, parsed)) return 'exact';
  // Range known but terminal outside — still allow header-group paint
  if (parsed.type === 'numeric_range' || parsed.type === 'alpha_range' || parsed.type === 'single' || parsed.type === 'named') {
    return 'header';
  }
  return 'header';
}

/**
 * Unique-or-fail: if candidates.length !== 1 after filtering → treat as unmatched.
 * No longer prefers hasCell — header_group only.
 */
function chooseBest(
  candidates: Array<{ c: TbMarkerMatchCandidate; kind: MatchKind; hasCell: boolean }>,
): TbMarkerMatchCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].c;
  // Unique-or-fail: multiple candidates → select best by match quality but keep unique preference
  const exact = candidates.filter(x => x.kind === 'exact');
  if (exact.length === 1) return exact[0].c;
  if (exact.length > 1) return exact[0].c;
  const range = candidates.filter(x => x.kind === 'range');
  if (range.length === 1) return range[0].c;
  if (range.length > 1) return range[0].c;
  return candidates[0].c;
}

function markerHasCell(marker: any, terminal: string): boolean {
  return !!resolveTerminalCellGeometry(marker.geometry, terminal);
}

function markerHasHeaderGeom(marker: any): boolean {
  return !!resolveHeaderGroupGeometry(marker.geometry)
    || (
      marker.geometry
      && Number(marker.geometry.width) > 0.001
      && Number(marker.geometry.height) > 0.001
    );
}

@Injectable()
export class TbMarkerMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gaDeviceLocations: GaDeviceLocationsService,
    private readonly manualEndpointMapping: ManualEndpointMappingService,
  ) {}

  async matchWireEndpoints(
    projectCode: string,
    frameId: string,
    source: MatchEndpoint,
    destination: MatchEndpoint,
    user?: User,
    drawingChecksum?: string | null,
  ): Promise<TbMarkerMatchResponse> {
    if (user?.role === 'wiring_technician') {
      await assertTechnicianAssignedToFrame(this.prisma, user, projectCode, frameId);
    }

    const sourceRaw = String(source.device || '').trim();
    const destRaw = String(destination.device || '').trim();
    const sourceTb = normalizeDeviceName(sourceRaw);
    const destTb = normalizeDeviceName(destRaw);
    const srcTerminal = String(source.terminal || '').trim();
    const dstTerminal = String(destination.terminal || '').trim();
    const checksum = drawingChecksum ? String(drawingChecksum).trim() : '';

    const sourceIsPhysical = !!(sourceTb && isPhysicalTbHeader(sourceTb));
    const destIsPhysical = !!(destTb && isPhysicalTbHeader(destTb));
    const tbGroupMatchEnabled = process.env.DWES_TB_GROUP_MATCH !== '0';

    // V2 endpoint classification
    const srcV2 = classifyEndpointV2(sourceRaw, srcTerminal);
    const dstV2 = classifyEndpointV2(destRaw, dstTerminal);

    const markers = await this.prisma.tb_markers.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: [{ marker_type: 'asc' }, { created_at: 'asc' }],
    });

    // Load manual endpoint mappings for this project/frame
    const manualMaps = this.manualEndpointMapping.list(projectCode, frameId);

    const isActive = (m: { marker_status?: string | null }) =>
      !m.marker_status || m.marker_status === 'ACTIVE';

    const matchesChecksum = (m: { drawing_checksum?: string | null }) => {
      if (!checksum) return true;
      const rowChecksum = (m as any).drawing_checksum;
      if (rowChecksum == null || rowChecksum === '') return false;
      return String(rowChecksum) === checksum;
    };

    const isPhysicalMarker = (m: { tb_number?: string | null }) =>
      isPhysicalTbHeader(String(m.tb_number || ''));

    const allowDevBaseline = process.env.DWES_LIVE_TB_BASELINE === '1';
    const isDevBaselineOnly = (m: { notes?: string | null; detection_method?: string | null }) =>
      String((m as any).notes || '').includes('DEV_BASELINE_FIXTURE')
      || String((m as any).detection_method || '') === 'DEV_BASELINE';

    const allowMarker = (m: any) => {
      if (!allowDevBaseline && isDevBaselineOnly(m)) return false;
      const view = readViewClassification(m.geometry, m.view_name);
      if (isLiveTbRejectedView(view)) return false;
      if (isLiveTbEligibleView(view)) return markerHasHeaderGeom(m);
      // UNKNOWN: allow when strip/header geometry exists (baseline fixtures use empty view)
      if (view === 'UNKNOWN' || !view) return markerHasHeaderGeom(m);
      return false;
    };

    let supersededExcluded = 0;
    for (const m of markers) {
      if (!isActive(m as any)) supersededExcluded += 1;
      else if (checksum && !matchesChecksum(m as any)) supersededExcluded += 1;
      else if (!allowDevBaseline && isDevBaselineOnly(m as any)) supersededExcluded += 1;
    }

    const source_rejection_reasons: string[] = [];
    const destination_rejection_reasons: string[] = [];

    // Build eligible DB candidates (active, checksum-matched, view-eligible)
    const eligibleDbMarkers = markers.filter(m => {
      if (!isActive(m as any)) return false;
      if (!matchesChecksum(m as any)) return false;
      if (!allowMarker(m as any)) return false;
      return true;
    });

    // Convert to HeaderGroupCandidates for the resolver
    const allDbCandidatesSrc: HeaderGroupCandidate[] = eligibleDbMarkers
      .filter(m => {
        if (sourceIsPhysical) {
          if (!isPhysicalMarker(m)) return false;
          if (normalizeDeviceName(m.tb_number) !== sourceTb) return false;
          if (m.marker_type === 'SOURCE_GROUP') return true;
          return tbGroupMatchEnabled && m.marker_type === 'TB_GROUP';
        }
        return true;
      })
      .map(m => asCandidateHeaderGroup(m, srcTerminal));

    const allDbCandidatesDst: HeaderGroupCandidate[] = eligibleDbMarkers
      .filter(m => {
        if (destIsPhysical) {
          if (!isPhysicalMarker(m)) return false;
          if (normalizeDeviceName(m.tb_number) !== destTb) return false;
          if (m.marker_type === 'DESTINATION_GROUP') return true;
          return tbGroupMatchEnabled && m.marker_type === 'TB_GROUP';
        }
        return true;
      })
      .map(m => asCandidateHeaderGroup(m, dstTerminal));

    // Record view rejection reasons for diagnostics
    for (const m of markers) {
      if (!isActive(m as any) || (checksum && !matchesChecksum(m as any))) continue;
      if (isDevBaselineOnly(m as any) && !allowDevBaseline) {
        if (normalizeDeviceName(m.tb_number) === sourceTb) source_rejection_reasons.push('excluded_DEV_BASELINE_FIXTURE');
        if (normalizeDeviceName(m.tb_number) === destTb) destination_rejection_reasons.push('excluded_DEV_BASELINE_FIXTURE');
        continue;
      }
      const v = readViewClassification((m as any).geometry, (m as any).view_name);
      if (isLiveTbRejectedView(v)) {
        if (normalizeDeviceName(m.tb_number) === sourceTb) source_rejection_reasons.push(`rejected_view:${v}`);
        if (normalizeDeviceName(m.tb_number) === destTb) destination_rejection_reasons.push(`rejected_view:${v}`);
      }
    }

    // ── SOURCE resolution ──────────────────────────────────────────────────
    let srcResult: SelectResult;
    let srcMatches: Array<{ c: TbMarkerMatchCandidate; kind: MatchKind; hasCell: boolean }> = [];
    let source_match_reason = '';

    if (!sourceRaw) {
      srcResult = {
        best: null,
        candidates: [],
        unmatched: true,
        reason: 'Source end is empty.',
        diagnostics: { matched_label: null, group_bbox: null, confidence: 'NONE', rejected_candidates: [] },
      };
      source_match_reason = 'Source end is empty.';
    } else if (!sourceIsPhysical) {
      // Equipment endpoint: use header-group resolver with V2 classification
      srcResult = resolveEndpointHeaderGroup(srcV2, allDbCandidatesSrc, manualMaps, srcTerminal, 'source');
      source_match_reason = srcResult.reason;
      if (srcResult.unmatched && !srcResult.rejection) {
        source_rejection_reasons.push('equipment/device');
      }
      if (srcResult.rejection === 'ambiguous' || srcResult.rejection === 'multiple_matches') {
        source_rejection_reasons.push(srcResult.rejection);
      }
    } else {
      // Physical TB header path — filtered candidates from DB
      const src = markers.filter(m => {
        if (!isActive(m as any)) return false;
        if (!matchesChecksum(m as any)) return false;
        if (!allowMarker(m as any)) {
          return false;
        }
        if (!isPhysicalMarker(m)) return false;
        if (normalizeDeviceName(m.tb_number) !== sourceTb) return false;
        if (m.marker_type === 'SOURCE_GROUP') return true;
        return tbGroupMatchEnabled && m.marker_type === 'TB_GROUP';
      });
      srcMatches = src
        .map(m => {
          const kind = classifyTerminalMatch(srcTerminal, m.terminal_group);
          const hasCell = markerHasCell(m, srcTerminal);
          return { c: asCandidate(m, srcTerminal), kind, hasCell };
        })
        .sort((a, b) => {
          const rank = (k: MatchKind) => (k === 'exact' ? 0 : k === 'range' ? 1 : 2);
          if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
          return a.c.id - b.c.id;
        });

      // Check manual maps for TB endpoints too
      if (srcMatches.length === 0 && manualMaps.length > 0) {
        srcResult = resolveEndpointHeaderGroup(srcV2, [], manualMaps, srcTerminal, 'source');
        source_match_reason = srcResult.reason;
      } else {
        const best = chooseBest(srcMatches);
        const srcCandList = srcMatches.map(x => x.c) as any[];
        srcResult = {
          best: best as any,
          candidates: srcCandList,
          unmatched: srcMatches.length === 0,
          reason: srcMatches.length === 0
            ? `Header group not found: no physical TB header group match for source TB="${sourceTb}".`
            : srcMatches.length > 1
              ? `Match 1 of ${srcMatches.length} for source TB="${sourceTb}" (schedule terminal ${srcTerminal || '—'}).`
              : `Matched source TB group ${sourceTb} (schedule terminal ${srcTerminal || '—'}) on ${best?.view_classification || 'view'} page ${best?.page_number}.`,
          rejection: srcMatches.length > 1 ? 'multiple_matches' : undefined,
          diagnostics: {
            page: best?.page_number || null,
            matched_label: best?.tb_number || null,
            group_bbox: best?.geometry?.strip_bbox || null,
            confidence: best ? (srcMatches.length > 1 ? 'MEDIUM' : 'HIGH') : 'NONE',
            rejected_candidates: [],
          },
        };
        source_match_reason = srcResult.reason;
      }
    }

    // ── DESTINATION resolution ─────────────────────────────────────────────
    let dstResult: SelectResult;
    let dstMatches: Array<{ c: TbMarkerMatchCandidate; kind: MatchKind; hasCell: boolean }> = [];
    let destination_match_reason = '';

    if (!destRaw) {
      dstResult = {
        best: null,
        candidates: [],
        unmatched: true,
        reason: 'Destination end is empty.',
        diagnostics: { matched_label: null, group_bbox: null, confidence: 'NONE', rejected_candidates: [] },
      };
      destination_match_reason = 'Destination end is empty.';
    } else if (!destIsPhysical) {
      // Equipment endpoint: use header-group resolver with V2 classification
      dstResult = resolveEndpointHeaderGroup(dstV2, allDbCandidatesDst, manualMaps, dstTerminal, 'destination');
      destination_match_reason = dstResult.reason;
      if (dstResult.unmatched && !dstResult.rejection) {
        destination_rejection_reasons.push('equipment/device');
      }
      if (dstResult.rejection === 'ambiguous' || dstResult.rejection === 'multiple_matches') {
        destination_rejection_reasons.push(dstResult.rejection);
      }
    } else {
      // Physical TB header path
      const dst = markers.filter(m => {
        if (!isActive(m as any)) return false;
        if (!matchesChecksum(m as any)) return false;
        if (!allowMarker(m as any)) {
          return false;
        }
        if (!isPhysicalMarker(m)) return false;
        if (normalizeDeviceName(m.tb_number) !== destTb) return false;
        if (m.marker_type === 'DESTINATION_GROUP') return true;
        return tbGroupMatchEnabled && m.marker_type === 'TB_GROUP';
      });
      dstMatches = dst
        .map(m => {
          const kind = classifyTerminalMatch(dstTerminal, m.terminal_group);
          const hasCell = markerHasCell(m, dstTerminal);
          return { c: asCandidate(m, dstTerminal), kind, hasCell };
        })
        .sort((a, b) => {
          const rank = (k: MatchKind) => (k === 'exact' ? 0 : k === 'range' ? 1 : 2);
          if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
          return a.c.id - b.c.id;
        });

      // Check manual maps for TB endpoints too
      if (dstMatches.length === 0 && manualMaps.length > 0) {
        dstResult = resolveEndpointHeaderGroup(dstV2, [], manualMaps, dstTerminal, 'destination');
        destination_match_reason = dstResult.reason;
      } else {
        const best = chooseBest(dstMatches);
        const dstCandList = dstMatches.map(x => x.c) as any[];
        dstResult = {
          best: best as any,
          candidates: dstCandList,
          unmatched: dstMatches.length === 0,
          reason: dstMatches.length === 0
            ? `Header group not found: no physical TB header group match for destination TB="${destTb}".`
            : dstMatches.length > 1
              ? `Match 1 of ${dstMatches.length} for destination TB="${destTb}" (schedule terminal ${dstTerminal || '—'}).`
              : `Matched destination TB group ${destTb} (schedule terminal ${dstTerminal || '—'}) on ${best?.view_classification || 'view'} page ${best?.page_number}.`,
          rejection: dstMatches.length > 1 ? 'multiple_matches' : undefined,
          diagnostics: {
            page: best?.page_number || null,
            matched_label: best?.tb_number || null,
            group_bbox: best?.geometry?.strip_bbox || null,
            confidence: best ? (dstMatches.length > 1 ? 'MEDIUM' : 'HIGH') : 'NONE',
            rejected_candidates: [],
          },
        };
        destination_match_reason = dstResult.reason;
      }
    }

    const bestSource = (srcResult.best as TbMarkerMatchCandidate | null) ?? chooseBest(srcMatches);
    const bestDestination = (dstResult.best as TbMarkerMatchCandidate | null) ?? chooseBest(dstMatches);
    const source_marker_candidates = (srcResult.candidates?.length
      ? srcResult.candidates
      : (srcResult.best ? [srcResult.best] : srcMatches.map(x => x.c))) as TbMarkerMatchCandidate[];
    const destination_marker_candidates = (dstResult.candidates?.length
      ? dstResult.candidates
      : (dstResult.best ? [dstResult.best] : dstMatches.map(x => x.c))) as TbMarkerMatchCandidate[];

    const same_physical_group = (() => {
      if (!bestSource || !bestDestination) return false;
      if (bestSource.id === bestDestination.id) return true;
      const sameTb =
        normalizeDeviceName(bestSource.tb_number) === normalizeDeviceName(bestDestination.tb_number);
      if (!sameTb) return false;
      if (bestSource.page_number !== bestDestination.page_number) return false;
      const sg = bestSource.geometry;
      const dg = bestDestination.geometry;
      if (!sg || !dg) return false;
      return (
        Number(sg.x) === Number(dg.x)
        && Number(sg.y) === Number(dg.y)
        && Number(sg.width) === Number(dg.width)
        && Number(sg.height) === Number(dg.height)
      );
    })();

    // PHASE 5: Call generic endpoint resolver for metadata
    const gaMarkersForResolver: GaMarker[] = markers
      .filter((m: any) => isActive(m) && matchesChecksum(m))
      .map((m: any) => ({
        id: m.id,
        tb_number: m.tb_number,
        terminal_group: m.terminal_group,
        page_number: m.page_number,
        view_name: m.view_name,
        geometry: m.geometry,
        view_classification: readViewClassification(m.geometry, m.view_name),
        detection_method: m.detection_method,
        marker_type: m.marker_type,
        marker_status: m.marker_status,
        drawing_checksum: m.drawing_checksum,
      }));

    const sourceResolution = resolvePhysicalParent({
      role: 'SOURCE',
      scheduleHeader: sourceIsPhysical ? sourceTb : (sourceRaw || null),
      scheduleEquipment: !sourceIsPhysical ? sourceRaw : null,
      scheduleTerminal: srcTerminal,
      gaMarkers: gaMarkersForResolver,
    });

    const destinationResolution = resolvePhysicalParent({
      role: 'DESTINATION',
      scheduleHeader: destIsPhysical ? destTb : (destRaw || null),
      scheduleEquipment: !destIsPhysical ? destRaw : null,
      scheduleTerminal: dstTerminal,
      gaMarkers: gaMarkersForResolver,
    });

    // 2E: Diagnostics — supervisor-level detail
    const isSupervisor = user?.role === 'prod_supervisor' || user?.role === 'system_admin';

    return {
      source_marker_candidates,
      destination_marker_candidates,
      best_source: bestSource,
      best_destination: bestDestination,
      source_unmatched: !bestSource,
      destination_unmatched: !bestDestination,
      source_match_reason,
      destination_match_reason,
      source_candidate_count: source_marker_candidates.length,
      destination_candidate_count: destination_marker_candidates.length,
      drawing_checksum_applied: checksum || null,
      superseded_excluded: supersededExcluded,
      source_rejection_reasons: [...new Set(source_rejection_reasons)],
      destination_rejection_reasons: [...new Set(destination_rejection_reasons)],
      same_physical_group,
      // PHASE 5: Include generic resolution metadata
      source_resolution: {
        endpoint_type: sourceResolution.endpointType,
        physical_identity: sourceResolution.physicalIdentity,
        terminal_reference: sourceResolution.terminalReference,
        location_granularity: sourceResolution.locationGranularity,
        status: sourceResolution.status,
        confidence: sourceResolution.confidence,
      },
      destination_resolution: {
        endpoint_type: destinationResolution.endpointType,
        physical_identity: destinationResolution.physicalIdentity,
        terminal_reference: destinationResolution.terminalReference,
        location_granularity: destinationResolution.locationGranularity,
        status: destinationResolution.status,
        confidence: destinationResolution.confidence,
      },
      // V2 Tranche 2
      source_endpoint_kind: srcV2.kind,
      destination_endpoint_kind: dstV2.kind,
      // Header group diagnostics (always)
      source_header_group_diagnostics: srcResult.diagnostics,
      destination_header_group_diagnostics: dstResult.diagnostics,
      // 2E: Diagnostics for authorized roles
      ...(isSupervisor ? {
        diagnostics: {
          source_rejected_reasons: [...new Set(source_rejection_reasons)],
          destination_rejected_reasons: [...new Set(destination_rejection_reasons)],
          source_classification: srcV2,
          destination_classification: dstV2,
        },
      } : {}),
    };
  }
}
