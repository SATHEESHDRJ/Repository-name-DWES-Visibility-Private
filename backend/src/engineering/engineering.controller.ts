import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RoutingService } from './routing.service';
import { EngineeringImportService } from './engineering-import.service';
import { OperationalTwinService } from './operational-twin.service';
import { OperationalTwin3dService } from './operational-twin-3d.service';
import { PrismaService } from '../prisma/prisma.service';
import { FrameStore } from '../frames/frame-store';
import { MockStore, type User } from '../data/mock-store';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { normalizeRef, terminalRef } from './package-validation';
import { assertTechnicianAssignedToFrame } from '../common/technician-panel-access.helper';
import { loadWiringDbTables, wiringTableReady } from '../common/wiring-db-tables';

@Controller('api/engineering')
@UseGuards(JwtAuthGuard, RolesGuard)
// sales_director excluded: twin context carries per-panel engineering detail.
@Roles('system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer', 'wiring_technician')
export class EngineeringController {
  private readonly logger = new Logger(EngineeringController.name);

  constructor(
    private readonly routingService: RoutingService,
    private readonly importService: EngineeringImportService,
    private readonly operationalTwin: OperationalTwinService,
    private readonly operationalTwin3d: OperationalTwin3dService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Operational 2D Twin — Mode A GEOMETRY when published structured data exists,
   * otherwise Mode B automatic Excel schematic. Never blocks wiring work.
   */
  @Get('operational-twin/:projectCode/:frameId')
  async getOperationalTwin(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Query('cableRef') cableRef: string | undefined,
    @CurrentUser() user: User,
  ) {
    await assertTechnicianAssignedToFrame(this.prisma, user, projectCode, frameId);
    return this.operationalTwin.getOperationalTwin(projectCode, frameId, cableRef);
  }

  /* ── Engineering import workflow (never technician-accessible) ──────────
     Chennai package → validate (dry-run) → import DRAFT → review → approve+publish.
     Only published models ever reach the technician Digital Twin. */

  @Post('validate/:projectCode/:frameId')
  @Roles('prod_supervisor', 'system_admin')
  validatePackage(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Body() body: unknown,
  ) {
    return this.importService.validateOnly(body, projectCode, frameId);
  }

  @Post('import/:projectCode/:frameId')
  @Roles('prod_supervisor', 'system_admin')
  importPackage(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Body() body: unknown,
    @CurrentUser() user: User,
  ) {
    return this.importService.importPackage(body, projectCode, frameId, user.id);
  }

  @Get('review/:modelId')
  @Roles('prod_supervisor', 'system_admin', 'ops_director')
  reviewSummary(@Param('modelId', ParseIntPipe) modelId: number) {
    return this.importService.reviewSummary(modelId);
  }

  @Post('approve/:modelId')
  @Roles('prod_supervisor', 'system_admin')
  approveAndPublish(@Param('modelId', ParseIntPipe) modelId: number, @CurrentUser() user: User) {
    return this.importService.approveAndPublish(modelId, { id: user.id, role: user.role });
  }

  /** List engineering revisions for a panel (supervisor/admin). */
  @Get('models/:projectCode/:frameId')
  @Roles('prod_supervisor', 'system_admin', 'ops_director')
  listModels(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
  ) {
    return this.importService.listModelsForPanel(projectCode, frameId);
  }

  @Get('twin-context/:projectCode/:frameId/:cableRef')
  async getTwinContext(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Param('cableRef') cableRef: string,
    @CurrentUser() user: User,
  ) {
    await assertTechnicianAssignedToFrame(this.prisma, user, projectCode, frameId);
    // Only APPROVED + PUBLISHED revisions are visible to the twin: draft imports
    // must never change what a technician sees.
    const tables = await loadWiringDbTables(this.prisma);
    const panelModel = wiringTableReady(tables, 'panel_models')
      ? await this.prisma.panel_models.findFirst({
          where: {
            project_code: projectCode,
            frame_id: frameId,
            approval_status: 'approved',
            published_at: { not: null },
          },
          orderBy: { published_at: 'desc' }
        })
      : null;

    if (!panelModel) {

      // No panel model: classification comes from the real drawing package only.
      // A controlled response is always returned — empty geometry tables are a
      // normal state, never a server error.
      const drawingPackage = FrameStore.getDrawingPackage(projectCode, frameId);
      const hasDrawing = Boolean(drawingPackage?.drawing_2d);
      return {
        classification: hasDrawing ? 'drawing-reference' : 'unavailable',
        hasApprovedDrawing: hasDrawing,
        hasStructuredModel: false,
        drawingRevision: drawingPackage?.revision ?? null,
        availableModes: hasDrawing ? ['approved-2d'] : [],
        missing_requirements: [
          ...(hasDrawing ? [] : ['Approved 2D drawing']),
          'Structured 3D model (STEP / IFC / glTF) or generated panel model',
          'Device & terminal coordinate mapping',
          'Cable duct nodes & segments (routing graph)',
          'Approved cable route for this schedule revision',
        ],
      };
    }

    // A PUBLISHED model exists — build the full twin context from real geometry.
    const devices = wiringTableReady(tables, 'device_geometries')
      ? await this.prisma.device_geometries.findMany({
          where: { panel_model_id: panelModel.id },
        })
      : [];
    const deviceIds = devices.map(d => d.id);
    const deviceCount = deviceIds.length;
    const [terminals, ductNodes, ductSegments] = await Promise.all([
      deviceCount > 0 && wiringTableReady(tables, 'terminal_geometries')
        ? this.prisma.terminal_geometries.findMany({ where: { device_geometry_id: { in: deviceIds } } })
        : Promise.resolve([] as Awaited<ReturnType<typeof this.prisma.terminal_geometries.findMany>>),
      wiringTableReady(tables, 'duct_nodes')
        ? this.prisma.duct_nodes.findMany({ where: { panel_model_id: panelModel.id } })
        : Promise.resolve([] as Awaited<ReturnType<typeof this.prisma.duct_nodes.findMany>>),
      wiringTableReady(tables, 'duct_segments')
        ? this.prisma.duct_segments.findMany({ where: { panel_model_id: panelModel.id, enabled: true } })
        : Promise.resolve([] as Awaited<ReturnType<typeof this.prisma.duct_segments.findMany>>),
    ]);
    const terminalCount = terminals.length;
    const drawingPackage = FrameStore.getDrawingPackage(projectCode, frameId);
    const hasDrawing = Boolean(drawingPackage?.drawing_2d);
    const hasTerminalMap = deviceCount > 0 && terminalCount > 0;
    const hasDuctGraph = ductNodes.length > 0 && ductSegments.length > 0;

    // Resolve the requested schedule cable's two ends against the terminal map.
    const frame = MockStore.findFrameByProjectAndId(projectCode, frameId)
      ?? FrameStore.getFrameFromDisk(projectCode, frameId);
    const cables: any[] = Array.isArray(frame?.cables) ? frame!.cables : [];
    const wanted = normalizeRef(cableRef);
    const cable = cables.find((c, i) => normalizeRef(String(c?.sno ?? i + 1)) === wanted) ?? null;
    const endRef = (device?: string, terminal?: string, combined?: string): string | null => {
      if (device && terminal) return terminalRef(device, terminal);
      const combo = String(combined ?? '').trim();
      const idx = combo.lastIndexOf(':');
      return idx > 0 ? terminalRef(combo.slice(0, idx), combo.slice(idx + 1)) : null;
    };
    const srcRef = cable ? endRef(cable.source_device, cable.source_terminal, cable.source) : null;
    const dstRef = cable ? endRef(cable.dest_device, cable.dest_terminal, cable.destination) : null;
    const byRef = new Map(terminals.map(t => [t.normalized_terminal_reference, t]));
    const sourceTerminal = srcRef ? byRef.get(srcRef) ?? null : null;
    const destinationTerminal = dstRef ? byRef.get(dstRef) ?? null : null;
    const cableMapped = Boolean(sourceTerminal && destinationTerminal);

    // Approved exact route recorded for THIS wiring row (wiring_row_id = "<frameId>#<sno>").
    const wiringRowId = cable ? `${frameId}#${cable.sno ?? ''}` : null;
    const approvedRoute = wiringRowId && wiringTableReady(tables, 'cable_route_mappings')
      ? await this.prisma.cable_route_mappings.findFirst({
          where: { wiring_row_id: wiringRowId, approval_status: 'approved' },
        })
      : null;

    // Calculated guidance route through the duct graph (deterministic A*).
    let calculatedRoute: { nodes: Array<{ x: number; y: number; z: number }>; length: number } | null = null;
    if (!approvedRoute && cableMapped && hasDuctGraph) {
      calculatedRoute = await this.routingService.calculateCableRoute(
        panelModel.id, sourceTerminal!, destinationTerminal!,
      );
    }

    const classification = approvedRoute
      ? 'approved-exact'
      : calculatedRoute
        ? 'calculated-guidance'
        : cableMapped
          ? 'endpoint-guidance'
          : hasTerminalMap
            ? 'endpoint-guidance'
            : hasDrawing
              ? 'drawing-reference'
              : 'unavailable';

    const missing: string[] = [];
    if (!hasDrawing) missing.push('Approved 2D drawing');
    if (!hasTerminalMap) missing.push('Device & terminal coordinate mapping');
    else if (!cableMapped) missing.push(`Terminal mapping for this cable (${[srcRef, dstRef].filter(Boolean).join(' → ') || 'ends unresolved'})`);
    if (!hasDuctGraph) missing.push('Cable duct nodes & segments (routing graph)');
    if (!approvedRoute) missing.push('Approved cable route for this schedule revision');

    return {
      classification,
      hasApprovedDrawing: hasDrawing,
      hasStructuredModel: true,
      drawingRevision: drawingPackage?.revision ?? null,
      modelRevision: panelModel.model_revision ?? null,
      availableModes: [
        ...(hasDrawing ? ['approved-2d'] : []),
        ...(hasTerminalMap ? ['flat-3d'] : []),
        ...(panelModel.model_storage_path ? ['engineering-3d'] : []),
      ],
      // Flat 3D payload — real published geometry only.
      panel: { width: panelModel.width, height: panelModel.height, depth: panelModel.depth, units: panelModel.units },
      devices: devices.map(d => ({
        id: d.id, tag: d.device_tag, type: d.device_type,
        x: d.x, y: d.y, z: d.z, width: d.width, height: d.height, depth: d.depth,
      })),
      duct_nodes: ductNodes.map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
      duct_segments: ductSegments.map(s => ({ source: s.source_node_id, destination: s.destination_node_id })),
      sourceMapping: sourceTerminal ? { ref: srcRef, x: sourceTerminal.x, y: sourceTerminal.y, z: sourceTerminal.z } : null,
      destinationMapping: destinationTerminal ? { ref: dstRef, x: destinationTerminal.x, y: destinationTerminal.y, z: destinationTerminal.z } : null,
      route: approvedRoute
        ? { type: 'approved', nodes: approvedRoute.route_nodes, length: approvedRoute.route_length }
        : calculatedRoute
          ? { type: 'calculated', nodes: calculatedRoute.nodes, length: calculatedRoute.length }
          : null,
      geometry: {
        devices: deviceCount,
        terminals: terminalCount,
        duct_nodes: ductNodes.length,
        duct_segments: ductSegments.length,
        approved_routes: approvedRoute ? 1 : 0,
      },
      missing_requirements: missing,
    };
  }

  /**
   * Live 3D Operational Twin payload.
   * Procedural panel shell + GA face metadata + device/terminal geometry + active-wire state.
   * Technicians require a released panel (enforced in service).
   * Optional cableRef resolves the active wire and its endpoint positions.
   */
  @Get('operational-twin-3d/:projectCode/:frameId')
  async getOperationalTwin3d(
    @Param('projectCode') projectCode: string,
    @Param('frameId') frameId: string,
    @Query('cableRef') cableRef: string | undefined,
    @CurrentUser() user: User,
  ) {
    await assertTechnicianAssignedToFrame(this.prisma, user, projectCode, frameId);
    return this.operationalTwin3d.getOperationalTwin3d(
      projectCode,
      frameId,
      user.role,
      cableRef,
      user.role === 'wiring_technician' ? user.id : null,
    );
  }
}

