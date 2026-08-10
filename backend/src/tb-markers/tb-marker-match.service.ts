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
import { GaDeviceLocationsService } from '../ga-device-locations/ga-device-locations.service';
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
};

type MatchEndpoint = {
  device: string;
  terminal: string;
};

type MatchKind = 'exact' | 'range' | 'header';

function asCandidate(marker: any, terminal: string): TbMarkerMatchCandidate {
  const view = readViewClassification(marker.geometry, marker.view_name);
  const cell = resolveTerminalCellGeometry(marker.geometry, terminal);
  const headerBox = resolveHeaderGroupGeometry(marker.geometry);
  const strip = marker.geometry && typeof marker.geometry === 'object' ? marker.geometry : null;
  const paintBox = cell || headerBox;
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
        paint_mode: cell ? 'terminal_cell' : 'header_group',
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

function chooseBest(
  candidates: Array<{ c: TbMarkerMatchCandidate; kind: MatchKind; hasCell: boolean }>,
): TbMarkerMatchCandidate | null {
  const withCell = candidates.filter(x => x.hasCell);
  const pool = withCell.length ? withCell : candidates;
  const exact = pool.filter(x => x.kind === 'exact');
  if (exact.length) return exact[0].c;
  const range = pool.filter(x => x.kind === 'range');
  if (range.length) return range[0].c;
  return pool.length ? pool[0].c : null;
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

    const markers = await this.prisma.tb_markers.findMany({
      where: { project_code: projectCode, frame_id: frameId },
      orderBy: [{ marker_type: 'asc' }, { created_at: 'asc' }],
    });

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

    let srcMatches: Array<{ c: TbMarkerMatchCandidate; kind: MatchKind; hasCell: boolean }> = [];
    let source_match_reason = '';
    if (!sourceIsPhysical) {
      // Source is DEVICE endpoint (equipment tag like 87STUB, K01, etc.)
      // Equipment endpoints cannot be matched via TB_GROUP markers.
      // They require device-specific geometry or equipment markers (not yet implemented).
      const srcEquipment = normalizeDeviceName(sourceRaw);
      if (!srcEquipment) {
        source_match_reason = 'Source end is empty.';
      } else {
        // DEVICE endpoints are unmatched in TB marker system
        // (They would be resolved via device geometry in a complete system)
        source_match_reason = `Source end is equipment/device "${srcEquipment}" (not a TB group). Device resolution not yet implemented.`;
        source_rejection_reasons.push('equipment/device');
      }
    } else {
      const src = markers.filter(m => {
        if (!isActive(m as any)) return false;
        if (!matchesChecksum(m as any)) return false;
        if (!allowMarker(m as any)) {
          if (isDevBaselineOnly(m as any)) source_rejection_reasons.push('excluded_DEV_BASELINE_FIXTURE');
          const v = readViewClassification((m as any).geometry, (m as any).view_name);
          if (isLiveTbRejectedView(v)) source_rejection_reasons.push(`rejected_view:${v}`);
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
          if (a.hasCell !== b.hasCell) return a.hasCell ? -1 : 1;
          const rank = (k: MatchKind) => (k === 'exact' ? 0 : k === 'range' ? 1 : 2);
          if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
          return a.c.id - b.c.id;
        });
      source_match_reason = srcMatches.length === 0
        ? `No physical TB header group match for source TB="${sourceTb}".`
        : (() => {
          const best = chooseBest(srcMatches);
          return `Matched source TB group ${sourceTb} (schedule terminal ${srcTerminal || '—'}) on ${best?.view_classification || 'view'} page ${best?.page_number}.`;
        })();
    }

    let dstMatches: Array<{ c: TbMarkerMatchCandidate; kind: MatchKind; hasCell: boolean }> = [];
    let destination_match_reason = '';
    if (!destIsPhysical) {
      // Destination is DEVICE endpoint (equipment tag like 87STUB, K01, etc.)
      // Equipment endpoints cannot be matched via TB_GROUP markers.
      // They require device-specific geometry or equipment markers (not yet implemented).
      const dstEquipment = normalizeDeviceName(destRaw);
      if (!dstEquipment) {
        destination_match_reason = 'Destination end is empty.';
      } else {
        // DEVICE endpoints are unmatched in TB marker system
        // (They would be resolved via device geometry in a complete system)
        destination_match_reason = `Destination end is equipment/device "${dstEquipment}" (not a TB group). Device resolution not yet implemented.`;
        destination_rejection_reasons.push('equipment/device');
      }
    } else {
      const dst = markers.filter(m => {
        if (!isActive(m as any)) return false;
        if (!matchesChecksum(m as any)) return false;
        if (!allowMarker(m as any)) {
          if (isDevBaselineOnly(m as any)) destination_rejection_reasons.push('excluded_DEV_BASELINE_FIXTURE');
          const v = readViewClassification((m as any).geometry, (m as any).view_name);
          if (isLiveTbRejectedView(v)) destination_rejection_reasons.push(`rejected_view:${v}`);
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
          if (a.hasCell !== b.hasCell) return a.hasCell ? -1 : 1;
          const rank = (k: MatchKind) => (k === 'exact' ? 0 : k === 'range' ? 1 : 2);
          if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
          return a.c.id - b.c.id;
        });
      destination_match_reason = dstMatches.length === 0
        ? `No physical TB header group match for destination TB="${destTb}".`
        : (() => {
          const best = chooseBest(dstMatches);
          return `Matched destination TB group ${destTb} (schedule terminal ${dstTerminal || '—'}) on ${best?.view_classification || 'view'} page ${best?.page_number}.`;
        })();
    }

    const bestSource = chooseBest(srcMatches);
    const bestDestination = chooseBest(dstMatches);
    const source_marker_candidates = srcMatches.map(x => x.c);
    const destination_marker_candidates = dstMatches.map(x => x.c);

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
    // Map database markers to GaMarker type
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

    // Resolve source endpoint independently.
    // DEVICE ends: pass equipment as scheduleHeader so TERM X* is not TB_GROUP.
    const sourceResolution = resolvePhysicalParent({
      role: 'SOURCE',
      scheduleHeader: sourceIsPhysical ? sourceTb : (sourceRaw || null),
      scheduleEquipment: !sourceIsPhysical ? sourceRaw : null,
      scheduleTerminal: srcTerminal,
      gaMarkers: gaMarkersForResolver,
    });

    // Resolve destination endpoint independently.
    const destinationResolution = resolvePhysicalParent({
      role: 'DESTINATION',
      scheduleHeader: destIsPhysical ? destTb : (destRaw || null),
      scheduleEquipment: !destIsPhysical ? destRaw : null,
      scheduleTerminal: dstTerminal,
      gaMarkers: gaMarkersForResolver,
    });

    return {
      source_marker_candidates,
      destination_marker_candidates,
      best_source: bestSource,
      best_destination: bestDestination,
      source_unmatched: source_marker_candidates.length === 0,
      destination_unmatched: destination_marker_candidates.length === 0,
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
    };
  }
}
