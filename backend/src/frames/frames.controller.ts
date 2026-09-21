import { Controller, Get, Post, Delete, Body, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { DwesFileInterceptor, type DwesUploadedFile } from '../common/interceptors/fastify-file.interceptor';
import { FramesService } from './frames.service';
import { WiringDocumentService } from '../projects/wiring-document.service';
import { PanelModelService, type PanelModelSpecPatch } from '../panel-model/panel-model.service';
import { Flat3dConversionService } from '../flat3d-conversion/flat3d-conversion.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, type PanelDrawingAssetKind } from '../data/mock-store';

@Controller('api/projects/:code')
@UseGuards(JwtAuthGuard)
export class FramesController {
  constructor(
    private svc: FramesService,
    private wiringDoc: WiringDocumentService,
    private panelModel: PanelModelService,
    private flat3d: Flat3dConversionService,
  ) {}

  @Get('frames')
  async findAll(@Param('code') code: string, @CurrentUser() user: User) {
    await this.assertTechnicianProjectAccess(user, code);
    const frames = await this.svc.findAll(code);
    if (user.role !== 'wiring_technician') return frames;
    const allowedIds = new Set(await this.svc.technicianAssignedFrameIds(code, user.id));
    return frames.filter(f => allowedIds.has(f.id));
  }

  @Post('frames')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  createPanel(
    @Param('code') code: string,
    @Body() body: {
      name: string;
      type?: string;
      voltage_level: string;
      system_type?: string;
    },
  ) { return this.svc.createPanel(code, body); }

  @Get('frames/:id')
  async findOne(@Param('code') code: string, @Param('id') id: string, @CurrentUser() user: User) {
    await this.assertTechnicianFrameAccess(user, code, id);
    return await this.svc.findOne(code, id);
  }

  /** Panel Project Completion Report PDF (executive single-page; GA drawing is separate).
   *  Technicians only when assigned to the project. */
  @Get('frames/:id/report-pdf')
  @UseGuards(RolesGuard)
  // sales_director excluded — panel reports carry technician contributions,
  // break/pause logs, and per-cable remarks.
  @Roles('prod_supervisor', 'ops_director', 'system_admin', 'qaqc_engineer', 'wiring_technician')
  async frameReportPdf(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    if (user.role === 'wiring_technician' && !(await this.svc.technicianAssignedToFrame(code, id, user.id))) {
      res.status(403).send({ statusCode: 403, message: 'You are not assigned to this panel' });
      return;
    }
    const { buffer, filename } = await this.wiringDoc.generatePanelCompletionReport(
      code,
      id,
      user.full_name || user.username || '',
    );
    res.headers({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  /**
   * Additive async variant of report-pdf, gated by DWES_ASYNC_REPORT_GENERATION (404
   * when disabled). Returns a job reference (poll via the existing GET /api/jobs/:id);
   * once COMPLETED, the job result's download_url points back at the unchanged
   * synchronous report-pdf endpoint above for actual delivery.
   */
  @Post('frames/:id/report-pdf-async')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'ops_director', 'system_admin', 'qaqc_engineer', 'wiring_technician')
  async frameReportPdfAsync(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    if (user.role === 'wiring_technician' && !(await this.svc.technicianAssignedToFrame(code, id, user.id))) {
      throw new ForbiddenException('You are not assigned to this panel');
    }
    return this.wiringDoc.enqueuePanelCompletionReport(code, id, user.id, user.full_name || user.username || '');
  }

  /** Live panel completion report data for on-screen executive preview. */
  @Get('frames/:id/completion-report')
  @UseGuards(RolesGuard)
  // sales_director excluded — see frameReportPdf.
  @Roles('prod_supervisor', 'ops_director', 'system_admin', 'qaqc_engineer', 'wiring_technician')
  async frameCompletionReport(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    if (user.role === 'wiring_technician' && !(await this.svc.technicianAssignedToFrame(code, id, user.id))) {
      throw new ForbiddenException('You are not assigned to this panel');
    }
    return this.wiringDoc.getPanelCompletionReportData(
      code,
      id,
      user.full_name || user.username || '',
    );
  }

  @Delete('frames/:id')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'system_admin')
  remove(@Param('code') code: string, @Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.remove(code, id, { id: user.id, full_name: user.full_name, username: user.username });
  }

  @Get('frames/:id/delete-precheck')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'system_admin')
  deleteFramePrecheck(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.deleteFramePrecheck(code, id);
  }

  @Post('frames/:id/delete-guarded')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'system_admin')
  deleteFrameGuarded(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body('confirmed_phrase') phrase: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.deleteFrameGuarded(code, id, (phrase || '').trim(), {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
    });
  }

  @Get('frames/:id/compare-status')
  async compareStatus(@Param('code') code: string, @Param('id') id: string, @CurrentUser() user: User) {
    await this.assertTechnicianFrameAccess(user, code, id);
    return this.svc.getCompareStatus(code, id);
  }

  // ── Verification endpoints ─────────────────────────────────────────────────

  @Get('frames/:id/verify-data')
  async verifyData(@Param('code') code: string, @Param('id') id: string, @CurrentUser() user: User) {
    await this.assertTechnicianFrameAccess(user, code, id);
    return this.svc.verifyData(code, id);
  }

  @Post('frames/:id/patch-cable')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  patchCable(
    @Param('code') code: string, @Param('id') id: string,
    @Body() body: { cable_index: number; field: string; value: string },
  ) { return this.svc.patchCable(code, id, body.cable_index, body.field, body.value); }

  @Post('frames/:id/patch-panel')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  patchPanel(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: {
      panel_name: string;
      panel_type?: string;
      voltage_level?: string;
      system_type?: string;
    },
  ) { return this.svc.patchPanel(code, id, body); }

  @Post('frames/:id/remap-column')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  remapColumn(
    @Param('code') code: string, @Param('id') id: string,
    @Body() body: { system_field: string; excel_header: string },
  ) { return this.svc.remapColumn(code, id, body.system_field, body.excel_header); }

  @Post('frames/:id/verify-confirm')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'system_admin', 'ops_director', 'qaqc_engineer')
  verifyConfirm(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.verifyConfirm(code, id);
  }

  @Post('frames/:id/compare-source-file')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'system_admin', 'ops_director', 'qaqc_engineer')
  @UseInterceptors(DwesFileInterceptor('file'))
  compareSourceFile(
    @Param('code') code: string, @Param('id') id: string,
    @UploadedFile() file: DwesUploadedFile,
  ) {
    if (!file?.buffer) throw new BadRequestException('No file provided');
    return this.svc.compareSourceFile(code, id, file.buffer);
  }

  @Post('frames/:id/compare-verify')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  verify(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.compareVerify(code, id);
  }

  @Post('frames/:id/compare-submit')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  submit(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.compareSubmit(code, id);
  }

  @Post('frames/:id/compare-revert')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  revert(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.compareRevert(code, id);
  }

  @Get('frames/:id/compare-mapping')
  async getMapping(@Param('code') code: string, @Param('id') id: string, @CurrentUser() user: User) {
    await this.assertTechnicianFrameAccess(user, code, id);
    return this.svc.getMapping(code, id);
  }

  @Post('frames/:id/compare-mapping')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  saveMapping(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { mapping: Record<string, string>; sheet_name: string },
  ) {
    return this.svc.saveMapping(code, id, body.mapping, body.sheet_name);
  }

  @Get('cables')
  async getCables(@Param('code') code: string, @CurrentUser() user: User) {
    await this.assertTechnicianProjectAccess(user, code);
    const cables = this.svc.getCables(code);
    if (user.role !== 'wiring_technician') return cables;
    const allowedIds = new Set(await this.svc.technicianAssignedFrameIds(code, user.id));
    return cables.filter(c => allowedIds.has(c.frame_id));
  }

  @Get('drawings')
  async getDrawings(@Param('code') code: string, @CurrentUser() user: User) {
    await this.assertTechnicianProjectAccess(user, code);
    if (user.role !== 'wiring_technician') return this.svc.getDrawings(code);
    const allowedIds = await this.svc.technicianAssignedFrameIds(code, user.id);
    const visible = allowedIds.flatMap(frameId => this.svc.getPanelDrawings(code, frameId));
    return [...new Map(visible.map(drawing => [drawing.id, drawing])).values()];
  }

  /** Read-only panel drawing inventory for Supervisor and the assigned Technician only. */
  @Get('frames/:id/drawings')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician')
  async getPanelDrawings(@Param('code') code: string, @Param('id') id: string, @CurrentUser() user: User) {
    await this.assertTechnicianFrameAccess(user, code, id);
    return this.svc.getPanelDrawings(code, id);
  }

  /** One stable panel drawing record with independent 2D and 3D source slots. */
  @Get('frames/:id/drawing')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician')
  async getPanelDrawingPackage(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.svc.findOne(code, id);
    await this.assertTechnicianFrameAccess(user, code, id);
    const record = this.svc.getPanelDrawingPackage(code, id);
    const supervisor = user.role === 'prod_supervisor';
    return {
      ...record,
      permissions: {
        can_view: true,
        can_upload_2d: supervisor && !record.drawing_2d,
        can_replace_2d: supervisor && !!record.drawing_2d,
        can_upload_3d: supervisor && !record.model_3d,
        can_replace_3d: supervisor && !!record.model_3d,
        can_download_2d: supervisor && !!record.drawing_2d,
        can_download_3d: supervisor && !!record.model_3d,
      },
    };
  }

  /** Inline, read-only source/preview stream for supervisor or a currently assigned technician. */
  @Get('frames/:id/drawing/:slot/file')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician')
  async panelDrawingAssetFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @Param('slot') slot: string,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    await this.svc.findOne(code, id);
    await this.assertTechnicianFrameAccess(user, code, id);
    const kind = this.parseDrawingSlot(slot);
    const file = this.svc.getPanelDrawingAssetFile(code, id, kind);
    if (!file) {
      res.status(404).send({ statusCode: 404, message: kind === '3d' ? '3D model not uploaded for this panel.' : '2D drawing not uploaded for this panel.' });
      return;
    }
    this.sendDrawingAsset(res, file.buffer, file.filename, file.contentType, 'inline');
  }

  /** Explicit original download is intentionally supervisor-only. */
  @Get('frames/:id/drawing/:slot/download')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  async panelDrawingAssetDownload(
    @Param('code') code: string,
    @Param('id') id: string,
    @Param('slot') slot: string,
    @Res() res: FastifyReply,
  ) {
    await this.svc.findOne(code, id);
    const kind = this.parseDrawingSlot(slot);
    const file = this.svc.getPanelDrawingAssetSourceFile(code, id, kind);
    if (!file) {
      res.status(404).send({ statusCode: 404, message: kind === '3d' ? '3D model not uploaded for this panel.' : '2D drawing not uploaded for this panel.' });
      return;
    }
    this.sendDrawingAsset(res, file.buffer, file.filename, file.contentType, 'attachment');
  }

  /** Strict panel-scoped stream: a drawing ID from another panel always resolves as not found. */
  @Get('frames/:id/drawings/:drawingId/file')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician')
  async panelDrawingFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @Param('drawingId') drawingId: string,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    await this.assertTechnicianFrameAccess(user, code, id);
    const file = this.svc.getPanelDrawingFile(code, id, drawingId);
    if (!file) {
      res.status(404).send({ statusCode: 404, message: 'Drawing is not available for this panel' });
      return;
    }
    res.headers({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Content-Length': String(file.buffer.length),
    });
    res.send(file.buffer);
  }

  // Additive read-only: stream a drawing file inline. Technicians may open it ONLY if they have an
  // assignment on this project; other authenticated roles per existing rules. No schema change.
  @Get('drawings/:id/file')
  async drawingFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    try {
      await this.assertTechnicianProjectAccess(user, code);
    } catch {
      res.status(403).send({ statusCode: 403, message: 'You are not assigned to this project' });
      return;
    }
    let file;
    if (user.role === 'wiring_technician') {
      const allowedIds = await this.svc.technicianAssignedFrameIds(code, user.id);
      const assignedFrame = allowedIds.find(frameId => this.svc.getPanelDrawings(code, frameId).some(drawing => drawing.id === id));
      file = assignedFrame ? this.svc.getPanelDrawingFile(code, assignedFrame, id) : null;
    } else {
      file = this.svc.getDrawingFile(code, id);
    }
    if (!file) {
      res.status(404).send({ statusCode: 404, message: 'Drawing not found' });
      return;
    }
    res.headers({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Content-Length': String(file.buffer.length),
    });
    res.send(file.buffer);
  }

  @Delete('drawings/:drawingId')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  removeDrawing(@Param('code') code: string, @Param('drawingId') drawingId: string) {
    return this.svc.removeDrawing(code, drawingId);
  }

  @Get('drawings/:drawingId/delete-precheck')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  deleteDrawingPrecheck(@Param('code') code: string, @Param('drawingId') drawingId: string) {
    return this.svc.deleteDrawingPrecheck(code, drawingId);
  }

  @Post('drawings/:drawingId/delete-guarded')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  deleteDrawingGuarded(
    @Param('code') code: string,
    @Param('drawingId') drawingId: string,
    @Body('confirmed_phrase') phrase: string,
  ) {
    return this.svc.deleteDrawingGuarded(code, drawingId, (phrase || '').trim());
  }

  // ── Generated 3D panel model (2D drawing → 3D conversion) ──────────────────
  // Same audience as the drawing package: supervisor + the assigned technician.
  // Technicians only ever see/stream APPROVED models (enforced in the service).

  /** Model state, revision history and permissions for THIS exact project + panel. */
  @Get('frames/:id/model')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician')
  async getPanelModel(@Param('code') code: string, @Param('id') id: string, @CurrentUser() user: User) {
    await this.assertTechnicianFrameAccess(user, code, id);
    return this.panelModel.getPanelModels(code, id, user);
  }

  /** Start a conversion for this panel from its own current drawing package. */
  @Post('frames/:id/model/convert')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  convertPanelModel(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { package_revision?: number },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.convert(code, id, user, body?.package_revision);
  }

  /** Supervisor correction of the latest model's spec → regenerate (still needs approval). */
  @Post('frames/:id/model/:modelId/spec')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  correctPanelModel(
    @Param('code') code: string,
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @Body() body: PanelModelSpecPatch,
    @CurrentUser() user: User,
  ) {
    return this.panelModel.updateSpec(code, id, modelId, body ?? {}, user, body?.package_revision);
  }

  /** Supervisor approval of the latest verified model revision. */
  @Post('frames/:id/model/:modelId/approve')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  approvePanelModel(
    @Param('code') code: string,
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @Body() body: { package_revision?: number; assumptions_acknowledged?: boolean; verification_notes?: string },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.approve(
      code,
      id,
      modelId,
      user,
      body?.package_revision,
      body?.assumptions_acknowledged === true,
      body?.verification_notes,
    );
  }

  /** Stream one generated GLB revision. Strictly panel-scoped; never cached. */
  @Get('frames/:id/model/:modelId/file')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician')
  async panelModelFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    await this.assertTechnicianFrameAccess(user, code, id);
    const file = this.panelModel.getModelFile(code, id, modelId, user);
    res.headers({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'private, no-store',
      'ETag': `"${file.sha256}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(file.buffer);
  }

  // ── Flat 3D drawing conversion (CAD-first path) ────────────────────────────

  /** Latest flat3d conversion run summary for this panel. No binary payloads. */
  @Get('frames/:id/model/flat3d/latest')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  async getFlat3dLatest(@Param('code') code: string, @Param('id') id: string) {
    const meta = await this.flat3d.getLatestRun(code, id);
    if (!meta) return { run: null, message: 'No flat3d conversion run found for this panel.' };
    // Strip any fields that could expose internal paths or binary data.
    return {
      run: {
        runId: meta.runId,
        status: meta.status,
        stages: meta.stages,
        overlay: meta.overlay ?? null,
        notes: meta.notes,
        fallback: meta.fallback ?? null,
        failureReason: meta.failureReason ?? null,
        createdAt: meta.createdAt,
      },
    };
  }

  /** Start (or enqueue) a flat3d conversion for this panel's current drawing. */
  @Post('frames/:id/model/auto-extract')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  autoExtractFill(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { package_revision?: number; regenerate?: boolean },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.autoExtractAndFill(code, id, user, body?.package_revision, { regenerate: body?.regenerate === true });
  }

  @Post('frames/:id/model/auto-fix')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  autoFixExtract(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { package_revision?: number },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.workflowFixSafe(code, id, user, body?.package_revision);
  }

  @Post('frames/:id/model/workflow/extract-generate')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  workflowExtractGenerate(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { package_revision?: number },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.workflowExtractGenerate(code, id, user, body?.package_revision);
  }

  @Post('frames/:id/model/workflow/diagnose')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  workflowDiagnose(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { package_revision?: number },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.workflowDiagnose(code, id, user, body?.package_revision);
  }

  @Post('frames/:id/model/workflow/fix-safe')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  workflowFixSafe(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { package_revision?: number },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.workflowFixSafe(code, id, user, body?.package_revision);
  }

  @Post('frames/:id/model/workflow/validate')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  workflowValidate(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() body: { package_revision?: number },
    @CurrentUser() user: User,
  ) {
    return this.panelModel.workflowValidate(code, id, user, body?.package_revision);
  }

  @Post('frames/:id/model/flat3d/convert')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  async startFlat3dConvert(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { package_revision?: number; skip_gltf_validator?: boolean },
  ) {
    // Delegate full panel-model conversion (which picks up the CAD-first path internally).
    return this.panelModel.convert(code, id, user, body?.package_revision);
  }

  @Get('director-reports')
  getDirectorReports(@Param('code') code: string, @CurrentUser() user: User) {
    this.assertTechnicianDenied(user);
    return this.svc.getDirectorReports(code);
  }

  @Get('director-reports/:id/file')
  async directorReportFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    this.assertTechnicianDenied(user);
    const file = this.svc.getDirectorReportFile(code, id);
    if (!file) {
      res.status(404).send({ statusCode: 404, message: 'Director report not found' });
      return;
    }
    res.headers({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Content-Length': String(file.buffer.length),
    });
    res.send(file.buffer);
  }

  @Delete('director-reports/:reportId')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  removeDirectorReport(@Param('code') code: string, @Param('reportId') reportId: string) {
    return this.svc.removeDirectorReport(code, reportId);
  }

  /** Technicians may read project-scoped document APIs only when assigned to the project. */
  private async assertTechnicianProjectAccess(user: User, projectCode: string): Promise<void> {
    if (user.role !== 'wiring_technician') return;
    if (!(await this.svc.technicianAssignedToProject(projectCode, user.id))) {
      throw new ForbiddenException('You are not assigned to this project');
    }
  }

  /** Technicians may read panel/frame data only for frames they are assigned to. */
  private async assertTechnicianFrameAccess(user: User, projectCode: string, frameId: string): Promise<void> {
    if (user.role !== 'wiring_technician') return;
    if (!(await this.svc.technicianAssignedToFrame(projectCode, frameId, user.id))) {
      throw new ForbiddenException('You are not assigned to this panel');
    }
  }

  /** Director reports are not exposed to wiring technicians. */
  private assertTechnicianDenied(user: User): void {
    if (user.role === 'wiring_technician') {
      throw new ForbiddenException('Not authorized for this resource');
    }
  }

  private parseDrawingSlot(slot: string): PanelDrawingAssetKind {
    if (slot === '2d' || slot === '3d') return slot;
    throw new BadRequestException('Drawing slot must be 2d or 3d');
  }

  private sendDrawingAsset(
    res: FastifyReply,
    buffer: Buffer,
    filename: string,
    contentType: string,
    disposition: 'inline' | 'attachment',
  ) {
    const fallback = filename.replace(/[\r\n"\\]/g, '_');
    res.headers({
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }
}
