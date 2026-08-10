/**
 * Operational 2D Twin service — Mode A (GEOMETRY) or Mode B (SCHEMATIC).
 *
 * Decision order:
 *  1. If published panel_models + device/terminal geometry exist → GEOMETRY
 *  2. Else → Mode B automatic Excel schematic (always works)
 *  3. CAD file parse (Mode A adapter) only when capability flag + licence allow;
 *     currently always disabled → diagnostics only.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from '../frames/frame-store';
import { MockStore } from '../data/mock-store';
import { RoutingService } from './routing.service';
import { TwinLayoutStore } from './twin-layout-store';
import { cadGeometryAdapter, isCadGeometryEnabled } from './cad-geometry-adapter';
import { normalizeRef, terminalRef } from './package-validation';
import type { TwinPanelLayout, TwinWireRoute } from './schematic-layout';
import { normalizeEngineeringTag } from './schematic-layout';
import { loadWiringDbTables, wiringTableReady } from '../common/wiring-db-tables';

export type OperationalRouteClass =
  | 'approved-exact'
  | 'calculated-guidance'
  | 'endpoint-guidance'
  | 'route-not-mapped';

@Injectable()
export class OperationalTwinService {
  private readonly logger = new Logger(OperationalTwinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
  ) {}

  async getOperationalTwin(
    projectCode: string,
    frameId: string,
    cableRef?: string | null,
  ) {
    const drawingPackage = FrameStore.getDrawingPackage(projectCode, frameId);
    const drawingRevision = drawingPackage?.revision != null ? String(drawingPackage.revision) : null;
    const hasApprovedDrawing = Boolean(drawingPackage?.drawing_2d);

    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    const cables: any[] = Array.isArray(frame?.cables) ? frame!.cables : [];

    const drawingFilename =
      drawingPackage?.drawing_2d?.original_name
      || drawingPackage?.drawing_2d?.filename
      || '';
    const cadDiagnostics = await cadGeometryAdapter.parse(Buffer.alloc(0), drawingFilename);
    const cadEnabled = isCadGeometryEnabled() && cadGeometryAdapter.enabled;

    const tables = await loadWiringDbTables(this.prisma);
    const panelModel = wiringTableReady(tables, 'panel_models')
      ? await this.prisma.panel_models.findFirst({
          where: {
            project_code: projectCode,
            frame_id: frameId,
            approval_status: 'approved',
            published_at: { not: null },
          },
          orderBy: { published_at: 'desc' },
        })
      : null;

    let geometryUsable = false;
    let devices: any[] = [];
    let terminals: any[] = [];
    let ductNodes: any[] = [];
    let ductSegments: any[] = [];

    if (panelModel) {
      devices = wiringTableReady(tables, 'device_geometries')
        ? await this.prisma.device_geometries.findMany({ where: { panel_model_id: panelModel.id } })
        : [];
      const deviceIds = devices.map(d => d.id);
      terminals = deviceIds.length && wiringTableReady(tables, 'terminal_geometries')
        ? await this.prisma.terminal_geometries.findMany({ where: { device_geometry_id: { in: deviceIds } } })
        : [];
      ductNodes = wiringTableReady(tables, 'duct_nodes')
        ? await this.prisma.duct_nodes.findMany({ where: { panel_model_id: panelModel.id } })
        : [];
      ductSegments = wiringTableReady(tables, 'duct_segments')
        ? await this.prisma.duct_segments.findMany({
            where: { panel_model_id: panelModel.id, enabled: true },
          })
        : [];
      // Require confident placement — never fabricate. Low/null confidence still usable
      // if coordinates exist (engineering import already validated).
      geometryUsable = devices.length > 0 && terminals.length > 0;
    }

    if (geometryUsable && panelModel) {
      return this.buildGeometryResponse({
        projectCode,
        frameId,
        cableRef,
        cables,
        panelModel,
        devices,
        terminals,
        ductNodes,
        ductSegments,
        drawingRevision,
        hasApprovedDrawing,
        cadDiagnostics: cadDiagnostics.diagnostics,
        cadEnabled,
      });
    }

    // Mode B — mandatory fallback
    const layout = TwinLayoutStore.getOrBuildSchematic(
      projectCode,
      frameId,
      cables,
      drawingRevision,
    );
    return this.buildSchematicResponse({
      layout,
      cableRef,
      cables,
      drawingRevision,
      hasApprovedDrawing,
      cadDiagnostics: [
        ...cadDiagnostics.diagnostics,
        geometryUsable ? '' : 'Published structured geometry insufficient or absent — using Mode B schematic.',
      ].filter(Boolean),
      cadEnabled,
      reason: !panelModel
        ? 'no_published_model'
        : !geometryUsable
          ? 'incomplete_geometry'
          : 'fallback',
    });
  }

  private buildSchematicResponse(args: {
    layout: TwinPanelLayout;
    cableRef?: string | null;
    cables: any[];
    drawingRevision: string | null;
    hasApprovedDrawing: boolean;
    cadDiagnostics: string[];
    cadEnabled: boolean;
    reason: string;
  }) {
    const { layout, cableRef, cables, drawingRevision, hasApprovedDrawing, cadDiagnostics, cadEnabled, reason } = args;
    const active = this.resolveActiveWire(layout, cableRef, cables);
    const wireStatusHint = this.wireEngineeringText(cables, active?.sno);

    return {
      drawingMode: 'SCHEMATIC' as const,
      classification: active?.classification ?? 'route-not-mapped',
      routeLabel: this.labelFor(active?.classification ?? 'route-not-mapped'),
      disclaimer: layout.diagnostics.note,
      panel: { width: layout.width, height: layout.height, units: 'schematic' },
      devices: layout.devices,
      terminals: layout.terminals,
      ductSegments: layout.ductSegments,
      wires: layout.wires,
      activeWire: active,
      wireStatusHint,
      scheduleRevision: layout.scheduleRevision,
      drawingRevision,
      generationVersion: layout.generationVersion,
      hasApprovedDrawing,
      hasStructuredModel: false,
      availableModes: hasApprovedDrawing ? ['approved-2d', 'schematic-2d'] : ['schematic-2d'],
      cad: { enabled: cadEnabled, diagnostics: cadDiagnostics },
      diagnostics: {
        fallbackReason: reason,
        ...layout.diagnostics,
      },
    };
  }

  private async buildGeometryResponse(args: {
    projectCode: string;
    frameId: string;
    cableRef?: string | null;
    cables: any[];
    panelModel: any;
    devices: any[];
    terminals: any[];
    ductNodes: any[];
    ductSegments: any[];
    drawingRevision: string | null;
    hasApprovedDrawing: boolean;
    cadDiagnostics: string[];
    cadEnabled: boolean;
  }) {
    const {
      frameId, cableRef, cables, panelModel, devices, terminals,
      ductNodes, ductSegments, drawingRevision, hasApprovedDrawing,
      cadDiagnostics, cadEnabled,
    } = args;

    const wanted = cableRef != null ? normalizeRef(String(cableRef)) : null;
    const cable = wanted
      ? cables.find((c, i) => normalizeRef(String(c?.sno ?? i + 1)) === wanted) ?? null
      : cables[0] ?? null;

    const endRef = (device?: string, terminal?: string, combined?: string): string | null => {
      if (device && terminal) return terminalRef(device, terminal);
      const combo = String(combined ?? '').trim();
      const idx = combo.lastIndexOf(':');
      return idx > 0 ? terminalRef(combo.slice(0, idx), combo.slice(idx + 1)) : null;
    };
    const byRef = new Map(terminals.map(t => [t.normalized_terminal_reference, t]));

    const wiringRowIds = cables.map(c => `${frameId}#${c?.sno ?? ''}`);
    const approvedRoutes = wiringRowIds.length && wiringTableReady(await loadWiringDbTables(this.prisma), 'cable_route_mappings')
      ? await this.prisma.cable_route_mappings.findMany({
          where: { wiring_row_id: { in: wiringRowIds }, approval_status: 'approved' },
        })
      : [];
    const approvedByRow = new Map(approvedRoutes.map(r => [r.wiring_row_id, r]));

    const hasDuctGraph = ductNodes.length > 0 && ductSegments.length > 0;

    const buildWire = async (
      c: any,
      opts: { calculateDuct: boolean },
    ): Promise<TwinWireRoute | null> => {
      if (!c) return null;
      const sno = String(c.sno ?? '');
      const wiringRowId = `${frameId}#${sno}`;
      const srcRef = endRef(c.source_device, c.source_terminal, c.source);
      const dstRef = endRef(c.dest_device, c.dest_terminal, c.destination);
      const sourceTerminal = srcRef ? byRef.get(srcRef) ?? null : null;
      const destinationTerminal = dstRef ? byRef.get(dstRef) ?? null : null;
      const cableMapped = Boolean(sourceTerminal && destinationTerminal);
      const approvedRoute = approvedByRow.get(wiringRowId) ?? null;

      let calculatedRoute: { nodes: Array<{ x: number; y: number; z: number }>; length: number } | null = null;
      if (!approvedRoute && cableMapped && hasDuctGraph && opts.calculateDuct) {
        calculatedRoute = await this.routingService.calculateCableRoute(
          panelModel.id, sourceTerminal!, destinationTerminal!,
        );
      }

      let classification: OperationalRouteClass = 'route-not-mapped';
      if (approvedRoute && cableMapped) classification = 'approved-exact';
      else if (calculatedRoute) classification = 'calculated-guidance';
      else if (cableMapped) classification = 'endpoint-guidance';

      const routePoints = approvedRoute
        ? (Array.isArray(approvedRoute.route_nodes) ? approvedRoute.route_nodes as any[] : [])
        : calculatedRoute?.nodes ?? (
          cableMapped
            ? [
                { x: sourceTerminal!.x, y: sourceTerminal!.y },
                { x: destinationTerminal!.x, y: destinationTerminal!.y },
              ]
            : []
        );

      if (!routePoints.length && !cableMapped) return null;

      const srcLabel = srcRef
        ? (sourceTerminal
          ? `${devices.find(d => d.id === sourceTerminal.device_geometry_id)?.device_tag ?? ''}:${sourceTerminal.terminal_number}`.replace(/^:/, '')
          : srcRef)
        : null;
      const dstLabel = dstRef
        ? (destinationTerminal
          ? `${devices.find(d => d.id === destinationTerminal.device_geometry_id)?.device_tag ?? ''}:${destinationTerminal.terminal_number}`.replace(/^:/, '')
          : dstRef)
        : null;

      return {
        wiringRowId,
        sno,
        sourceTwinTerminalId: sourceTerminal ? `term:${sourceTerminal.id}` : null,
        destinationTwinTerminalId: destinationTerminal ? `term:${destinationTerminal.id}` : null,
        sourceLabel: srcLabel || [c.source_device, c.source_terminal].filter(Boolean).join(':') || c.source || null,
        destinationLabel: dstLabel || [c.dest_device, c.dest_terminal].filter(Boolean).join(':') || c.destination || null,
        points: routePoints.map((p: any) => ({ x: Number(p.x), y: Number(p.y) })),
        classification,
        color: c.color,
      };
    };

    // Full duct calc only for the active serial; trail peers use approved / endpoint geometry.
    const activeWire = await buildWire(cable, { calculateDuct: true });
    const trailWires: TwinWireRoute[] = [];
    for (const c of cables) {
      const sno = normalizeRef(String(c?.sno ?? ''));
      if (activeWire && normalizeRef(activeWire.sno) === sno) {
        trailWires.push(activeWire);
        continue;
      }
      const peer = await buildWire(c, { calculateDuct: false });
      if (peer) trailWires.push(peer);
    }

    const classification = activeWire?.classification ?? 'route-not-mapped';
    const srcRef = cable ? endRef(cable.source_device, cable.source_terminal, cable.source) : null;
    const dstRef = cable ? endRef(cable.dest_device, cable.dest_terminal, cable.destination) : null;

    const twinDevices = devices.map(d => ({
      id: `dev:${d.id}`,
      tag: d.device_tag,
      normalizedTag: d.normalized_device_tag || normalizeEngineeringTag(d.device_tag),
      x: d.x,
      y: d.y,
      width: d.width ?? 40,
      height: d.height ?? 40,
      rotation: d.rotation_z ?? 0,
      placed: true,
      matchConfidence: d.mapping_confidence ?? 1,
      matchMethod: 'cad-exact' as const,
      side: 'both' as const,
    }));
    const twinTerminals = terminals.map(t => ({
      id: `term:${t.id}`,
      deviceId: `dev:${t.device_geometry_id}`,
      terminalNumber: t.terminal_number,
      x: t.x,
      y: t.y,
      direction: (t.direction as any) || 'right',
      placed: true,
    }));

    return {
      drawingMode: 'GEOMETRY' as const,
      classification,
      routeLabel: this.labelFor(classification),
      disclaimer: 'Geometry from published engineering model — not a fabricated layout.',
      panel: {
        width: panelModel.width ?? Math.max(1, ...devices.map(d => d.x + (d.width || 40))) + 40,
        height: panelModel.height ?? Math.max(1, ...devices.map(d => d.y + (d.height || 40))) + 40,
        units: panelModel.units ?? 'mm',
      },
      devices: twinDevices,
      terminals: twinTerminals,
      ductSegments: ductSegments.map(s => {
        const a = ductNodes.find(n => n.id === s.source_node_id);
        const b = ductNodes.find(n => n.id === s.destination_node_id);
        return {
          id: `duct:${s.id}`,
          points: a && b ? [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] : [],
          source: 'published-duct',
          approved: true,
        };
      }),
      wires: trailWires,
      activeWire,
      wireStatusHint: this.wireEngineeringText(cables, activeWire?.sno),
      scheduleRevision: null,
      drawingRevision,
      modelRevision: panelModel.model_revision,
      generationVersion: 1,
      hasApprovedDrawing,
      hasStructuredModel: true,
      availableModes: [
        ...(hasApprovedDrawing ? ['approved-2d'] : []),
        'geometry-2d',
        ...(panelModel.model_storage_path ? ['engineering-3d'] : []),
      ],
      cad: { enabled: cadEnabled, diagnostics: cadDiagnostics },
      diagnostics: {
        fallbackReason: null,
        deviceCount: devices.length,
        terminalCount: terminals.length,
        unmatched: [srcRef, dstRef].filter(r => r && !byRef.has(r)),
        note: 'Mode A / published geometry path — trail wires included for prior serials.',
      },
    };
  }

  private resolveActiveWire(
    layout: TwinPanelLayout,
    cableRef: string | null | undefined,
    cables: any[],
  ): TwinWireRoute | null {
    if (!layout.wires.length) return null;
    if (cableRef != null && String(cableRef).trim() !== '') {
      const wanted = normalizeRef(String(cableRef));
      const hit = layout.wires.find(w => normalizeRef(w.sno) === wanted);
      if (hit) return hit;
    }
    if (cables[0]) {
      const first = normalizeRef(String(cables[0].sno ?? 1));
      return layout.wires.find(w => normalizeRef(w.sno) === first) ?? layout.wires[0];
    }
    return layout.wires[0];
  }

  private wireEngineeringText(cables: any[], sno?: string | null) {
    if (!sno) return null;
    const wanted = normalizeRef(sno);
    const cable = cables.find((c, i) => normalizeRef(String(c?.sno ?? i + 1)) === wanted);
    if (!cable) return null;
    return {
      sno: cable.sno,
      source: cable.source || [cable.source_device, cable.source_terminal].filter(Boolean).join(':'),
      destination: cable.destination || [cable.dest_device, cable.dest_terminal].filter(Boolean).join(':'),
      color: cable.color,
      size: cable.size,
      ferrule: cable.ferrule,
      ref: cable.ref,
    };
  }

  private labelFor(c: OperationalRouteClass): string {
    switch (c) {
      case 'approved-exact': return 'Approved Exact Route';
      case 'calculated-guidance': return 'Calculated Guidance';
      case 'endpoint-guidance': return 'Endpoint Guidance';
      default: return 'Route Not Mapped';
    }
  }
}
