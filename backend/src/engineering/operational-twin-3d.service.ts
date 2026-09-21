import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
// normalizeRef is used for cable lookup, terminalRef for direct reference construction
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from '../frames/frame-store';
import { MockStore } from '../data/mock-store';
import { normalizeRef, terminalRef } from './package-validation';
import { parseCableStatus } from '../common/cable-status.util';
import { loadWiringDbTables, wiringTableReady } from '../common/wiring-db-tables';

/** Scene scale: Three.js world unit = 1 mm * 0.001 (scene is in metres). */
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
  /** Normalized viewport stored in the ga_faces row (0–1 scale). */
  viewport: { width: number; height: number };
}

export interface Ot3dDevice {
  id: number;
  stableItemId: string | null;
  tag: string;
  description: string | null;
  type: string | null;
  face: string;
  /** Position and size in mm (panel-local). */
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
  /** Approved-exact route nodes in mm, when available. */
  routeNodes?: Array<{ x: number; y: number; z: number }>;
  /** Calculated-guidance route nodes in mm, when available. */
  guidanceNodes?: Array<{ x: number; y: number; z: number }>;
}

export interface Ot3dPayload {
  projectCode: string;
  frameId: string;
  sceneScale: number;
  /** Panel enclosure in mm. */
  panelMm: { height: number; width: number; depth: number };
  gaAssetSetId: string | null;
  gaRevision: number | null;
  mappingRevision: string | null;
  scheduleRevision: string | null;
  releaseStatus: string | null;
  faces: Ot3dFace[];
  devices: Ot3dDevice[];
  /** Current active wire state, if cableRef provided. */
  activeWire: Ot3dWireState | null;
  /** All schedule wires with resolved endpoint geometry (for as-wired painting). */
  wires: Ot3dWireState[];
  /** Live execution status keyed by cable index / sno (from tech_assignments). */
  executionBySno: Record<string, { src: boolean; dst: boolean; issue?: boolean; technicianId?: number }>;
  legacy: boolean;
}

/**
 * Convert normalized face coordinates (0–1) to panel-local mm.
 *
 * Front / custom: x increases right, y increases upward (flip from normalized 0=top).
 * Internal:       same XY as front, z offset 10% of depth inside.
 * Rear:           x mirrored (x increases left when viewed from rear).
 */
export function normalizedFaceToMm(
  normalizedX: number,
  normalizedY: number,
  face: string,
  panelH: number,
  panelW: number,
  panelD: number,
): { xMm: number; yMm: number; zMm: number } {
  const xMm = face === 'rear'
    ? panelW * (1 - normalizedX)
    : normalizedX * panelW;
  // Flip Y: normalized 0 = top, mm 0 = bottom of panel
  const yMm = panelH * (1 - normalizedY);
  const zMm =
    face === 'internal' ? panelD * 0.1
    : face === 'rear' ? panelD
    : 0;
  return { xMm, yMm, zMm };
}

@Injectable()
export class OperationalTwin3dService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperationalTwin3d(
    projectCode: string,
    frameId: string,
    userRole: string,
    cableRef?: string | null,
    technicianId?: number | null,
  ): Promise<Ot3dPayload> {
    // --- Release gate for technicians -----------------------------------------
    const tables = await loadWiringDbTables(this.prisma);
    const gaAssetSetsReady = wiringTableReady(tables, 'ga_asset_sets');
    if (userRole === 'wiring_technician') {
      if (!gaAssetSetsReady) {
        return this.legacyPayload(projectCode, frameId, cableRef, technicianId);
      }
      const gaSetCheck = await this.prisma.ga_asset_sets.findFirst({
        where: { project_code: projectCode, frame_id: frameId, status: 'confirmed' },
        orderBy: { revision: 'desc' },
      });
      if (gaSetCheck && gaSetCheck.release_status !== 'released') {
        throw new ForbiddenException(
          'Panel 3D twin is not yet released. Complete GA foundation workflow before viewing.',
        );
      }
    }

    if (!gaAssetSetsReady) {
      return this.legacyPayload(projectCode, frameId, cableRef, technicianId);
    }

    // --- Load canonical GA Asset Set ------------------------------------------
    const gaSet = await this.prisma.ga_asset_sets.findFirst({
      where: { project_code: projectCode, frame_id: frameId, status: 'confirmed' },
      orderBy: { revision: 'desc' },
    });

    if (!gaSet) {
      return this.legacyPayload(projectCode, frameId, cableRef, technicianId);
    }

    const panelH = gaSet.panel_height ?? 0;
    const panelW = gaSet.panel_width ?? 0;
    const panelD = gaSet.panel_depth ?? 200;

    // --- Load confirmed GA faces ----------------------------------------------
    const gaFacesRows = await this.prisma.ga_faces.findMany({
      where: { ga_asset_set_id: gaSet.id, status: 'confirmed' },
    });

    const faces: Ot3dFace[] = gaFacesRows.map(f => {
      const vp =
        f.viewport && typeof f.viewport === 'object' && !Array.isArray(f.viewport)
          ? (f.viewport as Record<string, number>)
          : { width: 1, height: 1 };
      return {
        faceId: f.id,
        face: f.face as Ot3dFace['face'],
        customLabel: f.custom_label,
        imagePath: f.image_storage_path,
        imageWidth: f.image_width,
        imageHeight: f.image_height,
        viewport: {
          width: Number(vp['width'] ?? 1),
          height: Number(vp['height'] ?? 1),
        },
      };
    });

    // --- Load device/terminal geometries from Mapping Catalog -----------------
    const panelModel =
      gaSet.mapping_model_id
        ? await this.prisma.panel_models.findUnique({ where: { id: gaSet.mapping_model_id } })
        : await this.prisma.panel_models.findFirst({
            where: {
              project_code: projectCode,
              frame_id: frameId,
              approval_status: 'approved',
              published_at: { not: null },
            },
            orderBy: { published_at: 'desc' },
          });

    const devices: Ot3dDevice[] = [];

    if (panelModel) {
      const rawDevices = await this.prisma.device_geometries.findMany({
        where: { panel_model_id: panelModel.id },
      });

      // Collect terminal batches for all devices in one query
      const deviceIds = rawDevices.map(d => d.id);
      const allTerminals = deviceIds.length
        ? await this.prisma.terminal_geometries.findMany({
            where: { device_geometry_id: { in: deviceIds } },
          })
        : [];

      const termsByDevice = new Map<number, typeof allTerminals>();
      for (const t of allTerminals) {
        const bucket = termsByDevice.get(t.device_geometry_id) ?? [];
        bucket.push(t);
        termsByDevice.set(t.device_geometry_id, bucket);
      }

      for (const d of rawDevices) {
        const deviceFace = String((d as Record<string, unknown>)['face'] ?? 'internal');
        const normX = panelW > 0 ? d.x / panelW : d.x;
        const normY = panelH > 0 ? d.y / panelH : d.y;
        const { xMm, yMm } = normalizedFaceToMm(normX, normY, deviceFace, panelH, panelW, panelD);

        const rawTerminals = termsByDevice.get(d.id) ?? [];
        const terminals: Ot3dTerminal[] = rawTerminals.map(t => {
          const tnX = panelW > 0 ? t.x / panelW : t.x;
          const tnY = panelH > 0 ? t.y / panelH : t.y;
          const { xMm: txMm, yMm: tyMm, zMm: tzMm } = normalizedFaceToMm(
            tnX, tnY, deviceFace, panelH, panelW, panelD,
          );
          return {
            id: t.id,
            terminalRef: t.normalized_terminal_reference ?? '',
            xMm: txMm,
            yMm: tyMm,
            zMm: tzMm,
          };
        });

        devices.push({
          id: d.id,
          stableItemId: String((d as Record<string, unknown>)['stable_item_id'] ?? '') || null,
          tag: d.device_tag,
          description: String((d as Record<string, unknown>)['description'] ?? '') || null,
          type: d.device_type ?? null,
          face: deviceFace,
          xMm,
          yMm,
          widthMm: d.width ?? 0,
          heightMm: d.height ?? 0,
          depthMm: d.depth ?? 10,
          mappingRevision: gaSet.mapping_revision ?? null,
          terminals,
        });
      }
    }

    // --- Active wire state ----------------------------------------------------
    let activeWire: Ot3dWireState | null = null;
    if (cableRef) {
      activeWire = await this.resolveActiveWire(
        projectCode, frameId, cableRef, gaSet, panelH, panelW, panelD,
      );
    }

    const wires = await this.resolveAllWires(projectCode, frameId, gaSet, panelH, panelW, panelD);
    const executionBySno = await this.loadExecutionStatus(projectCode, frameId, technicianId);

    return {
      projectCode,
      frameId,
      sceneScale: SCENE_SCALE,
      panelMm: { height: panelH, width: panelW, depth: panelD },
      gaAssetSetId: gaSet.id,
      gaRevision: gaSet.revision,
      mappingRevision: gaSet.mapping_revision ?? null,
      scheduleRevision: gaSet.schedule_revision ?? null,
      releaseStatus: gaSet.release_status,
      faces,
      devices,
      activeWire,
      wires,
      executionBySno,
      legacy: false,
    };
  }

  private async loadExecutionStatus(
    projectCode: string,
    frameId: string,
    technicianId?: number | null,
  ): Promise<Record<string, { src: boolean; dst: boolean; issue?: boolean; technicianId?: number }>> {
    const assignment = await this.prisma.tech_assignments.findFirst({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        ...(technicianId ? { technician_id: technicianId } : {}),
        is_hidden: { not: true },
        changeover_locked: { not: true },
      },
      orderBy: { assigned_at: 'desc' },
    });
    const raw = parseCableStatus(assignment?.cable_status as string | Record<string, { src?: boolean; dst?: boolean; note?: string; issue?: boolean; technicianId?: number }> | null);
    const out: Record<string, { src: boolean; dst: boolean; issue?: boolean; technicianId?: number }> = {};
    for (const [key, entry] of Object.entries(raw)) {
      out[key] = {
        src: !!entry.src,
        dst: !!entry.dst,
        issue: !!(entry as { issue?: boolean }).issue,
        ...(entry.technicianId != null ? { technicianId: entry.technicianId } : {}),
      };
    }
    return out;
  }

  private async resolveAllWires(
    projectCode: string,
    frameId: string,
    gaSet: { id: string; mapping_model_id: number | null },
    panelH: number,
    panelW: number,
    panelD: number,
  ): Promise<Ot3dWireState[]> {
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    const cables: unknown[] = Array.isArray(frame?.cables) ? frame!.cables : [];
    const wires: Ot3dWireState[] = [];
    for (let i = 0; i < cables.length; i++) {
      const cable = cables[i] as Record<string, unknown>;
      const ref = String(cable['sno'] ?? i + 1);
      const wire = await this.resolveActiveWire(
        projectCode, frameId, ref, gaSet, panelH, panelW, panelD,
      );
      if (wire) wires.push(wire);
    }
    return wires;
  }

  private async resolveActiveWire(
    projectCode: string,
    frameId: string,
    cableRef: string,
    _gaSet: { id: string; mapping_model_id: number | null },
    panelH: number,
    panelW: number,
    panelD: number,
  ): Promise<Ot3dWireState | null> {
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    const cables: unknown[] = Array.isArray(frame?.cables) ? frame!.cables : [];
    const wanted = normalizeRef(cableRef);
    const cable = (cables as Record<string, unknown>[]).find(
      (c, i) => normalizeRef(String(c['sno'] ?? i + 1)) === wanted,
    );
    if (!cable) return null;

    const wiringRowId = `${frameId}#${cable['sno'] ?? ''}`;

    // Resolve endpoints from correlation results
    const [srcCorr, dstCorr] = await Promise.all([
      this.prisma.ga_correlation_results.findFirst({
        where: {
          project_code: projectCode,
          frame_id: frameId,
          wiring_row_id: wiringRowId,
          endpoint: 'source',
          state: { in: ['exact_match', 'suggested_match'] },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.ga_correlation_results.findFirst({
        where: {
          project_code: projectCode,
          frame_id: frameId,
          wiring_row_id: wiringRowId,
          endpoint: 'destination',
          state: { in: ['exact_match', 'suggested_match'] },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const src = await this.resolveEndpointMapping(
      srcCorr, String(cable['source_device'] ?? ''), String(cable['source_terminal'] ?? ''),
      panelH, panelW, panelD, true,
    );
    const dst = await this.resolveEndpointMapping(
      dstCorr, String(cable['dest_device'] ?? ''), String(cable['dest_terminal'] ?? ''),
      panelH, panelW, panelD, true,
    );

    // Check for approved route
    const approvedRoute = await this.prisma.cable_route_mappings.findFirst({
      where: { wiring_row_id: wiringRowId, approval_status: 'approved' },
    });

    const routeLabel: Ot3dRouteLabel =
      approvedRoute ? 'Approved Exact Route'
      : src.terminalId && dst.terminalId ? 'Endpoint Guidance'
      : src.terminalId || dst.terminalId ? 'Endpoint Guidance'
      : 'Route Not Mapped';

    const routeNodes =
      approvedRoute
        ? (Array.isArray(approvedRoute.route_nodes)
          ? (approvedRoute.route_nodes as Array<{ x: number; y: number; z: number }>)
          : undefined)
        : undefined;

    return {
      sno: cable['sno'] as string | number ?? cableRef,
      color: (cable['color'] as string) ?? null,
      size: (cable['size'] as string) ?? (cable['cross_section'] as string) ?? null,
      routeLabel,
      source: src,
      destination: dst,
      ...(routeNodes ? { routeNodes } : {}),
    };
  }

  private async resolveEndpointMapping(
    corr: { final_terminal_id: number | null; matched_terminal_id: number | null } | null,
    rawDevice: string,
    rawTerminal: string,
    panelH: number,
    panelW: number,
    panelD: number,
    preferCorrelation: boolean,
  ): Promise<Ot3dEndpointMapping> {
    const termId = preferCorrelation
      ? (corr?.final_terminal_id ?? corr?.matched_terminal_id ?? null)
      : null;

    if (termId) {
      const t = await this.prisma.terminal_geometries.findUnique({ where: { id: termId } });
      if (t) {
        const d = await this.prisma.device_geometries.findUnique({ where: { id: t.device_geometry_id } });
        const face = String((d as Record<string, unknown> | null)?.['face'] ?? 'internal');
        const { xMm, yMm, zMm } = normalizedFaceToMm(
          panelW > 0 ? t.x / panelW : t.x,
          panelH > 0 ? t.y / panelH : t.y,
          face, panelH, panelW, panelD,
        );
        return {
          terminalId: t.id,
          terminalRef: t.normalized_terminal_reference ?? null,
          xMm, yMm, zMm,
          confirmed: true,
        };
      }
    }

    // Direct lookup by normalized reference
    if (rawDevice && rawTerminal) {
      const ref = terminalRef(rawDevice, rawTerminal);
      if (ref) {
        const t = await this.prisma.terminal_geometries.findFirst({
          where: { normalized_terminal_reference: ref },
        });
        if (t) {
          const d = await this.prisma.device_geometries.findUnique({ where: { id: t.device_geometry_id } });
          const face = String((d as Record<string, unknown> | null)?.['face'] ?? 'internal');
          const { xMm, yMm, zMm } = normalizedFaceToMm(
            panelW > 0 ? t.x / panelW : t.x,
            panelH > 0 ? t.y / panelH : t.y,
            face, panelH, panelW, panelD,
          );
          return {
            terminalId: t.id,
            terminalRef: t.normalized_terminal_reference ?? null,
            xMm, yMm, zMm,
            confirmed: false,
          };
        }
      }
    }

    return { terminalId: null, terminalRef: null, xMm: null, yMm: null, zMm: null, confirmed: false };
  }

  private async legacyPayload(
    projectCode: string,
    frameId: string,
    _cableRef?: string | null,
    technicianId?: number | null,
  ): Promise<Ot3dPayload> {
    const tables = await loadWiringDbTables(this.prisma);
    if (!wiringTableReady(tables, 'panel_models')) {
      return {
        projectCode,
        frameId,
        sceneScale: SCENE_SCALE,
        panelMm: { height: 0, width: 0, depth: 200 },
        gaAssetSetId: null,
        gaRevision: null,
        mappingRevision: null,
        scheduleRevision: null,
        releaseStatus: null,
        faces: [],
        devices: [],
        activeWire: null,
        wires: [],
        executionBySno: await this.loadExecutionStatus(projectCode, frameId, technicianId),
        legacy: true,
      };
    }
    const panelModel = await this.prisma.panel_models.findFirst({
      where: {
        project_code: projectCode,
        frame_id: frameId,
        approval_status: 'approved',
        published_at: { not: null },
      },
      orderBy: { published_at: 'desc' },
    });

    const panelH = panelModel?.height ?? 0;
    const panelW = panelModel?.width ?? 0;
    const panelD = panelModel?.depth ?? 200;

    const devices: Ot3dDevice[] = [];
    if (panelModel) {
      const rawDevices = wiringTableReady(tables, 'device_geometries')
        ? await this.prisma.device_geometries.findMany({
            where: { panel_model_id: panelModel.id },
          })
        : [];
      const deviceIds = rawDevices.map(d => d.id);
      const allTerminals = deviceIds.length && wiringTableReady(tables, 'terminal_geometries')
        ? await this.prisma.terminal_geometries.findMany({
            where: { device_geometry_id: { in: deviceIds } },
          })
        : [];
      const termsByDevice = new Map<number, typeof allTerminals>();
      for (const t of allTerminals) {
        const bucket = termsByDevice.get(t.device_geometry_id) ?? [];
        bucket.push(t);
        termsByDevice.set(t.device_geometry_id, bucket);
      }

      for (const d of rawDevices) {
        const rawTerminals = termsByDevice.get(d.id) ?? [];
        devices.push({
          id: d.id,
          stableItemId: null,
          tag: d.device_tag,
          description: null,
          type: d.device_type ?? null,
          face: 'internal',
          xMm: d.x,
          yMm: d.y,
          widthMm: d.width ?? 0,
          heightMm: d.height ?? 0,
          depthMm: d.depth ?? 10,
          mappingRevision: panelModel.model_revision ?? null,
          terminals: rawTerminals.map(t => ({
            id: t.id,
            terminalRef: t.normalized_terminal_reference ?? '',
            xMm: t.x,
            yMm: t.y,
            zMm: t.z,
          })),
        });
      }
    }

    return {
      projectCode,
      frameId,
      sceneScale: SCENE_SCALE,
      panelMm: { height: panelH, width: panelW, depth: panelD },
      gaAssetSetId: null,
      gaRevision: null,
      mappingRevision: panelModel?.model_revision ?? null,
      scheduleRevision: null,
      releaseStatus: null,
      faces: [],
      devices,
      activeWire: null,
      wires: [],
      executionBySno: await this.loadExecutionStatus(projectCode, frameId, technicianId),
      legacy: true,
    };
  }
}
