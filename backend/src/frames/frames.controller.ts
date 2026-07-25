import { Controller, Get, Post, Delete, Body, Param, UseGuards, Res, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FramesService } from './frames.service';
import { WiringDocumentService } from '../projects/wiring-document.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../data/mock-store';

@Controller('api/projects/:code')
@UseGuards(JwtAuthGuard)
export class FramesController {
  constructor(
    private svc: FramesService,
    private wiringDoc: WiringDocumentService,
  ) {}

  @Get('frames')
  async findAll(@Param('code') code: string, @CurrentUser() user: User) {
    await this.assertTechnicianProjectAccess(user, code);
    const frames = this.svc.findAll(code);
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
    return this.svc.findOne(code, id);
  }

  /** Panel Project Completion Report PDF (executive single-page; GA drawing is separate).
   *  Technicians only when assigned to the project. */
  @Get('frames/:id/report-pdf')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'ops_director', 'system_admin', 'qaqc_engineer', 'wiring_technician')
  async frameReportPdf(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    if (user.role === 'wiring_technician' && !(await this.svc.technicianAssignedToProject(code, user.id))) {
      res.status(403).json({ statusCode: 403, message: 'You are not assigned to this project' });
      return;
    }
    const { buffer, filename } = await this.wiringDoc.generatePanelCompletionReport(
      code,
      id,
      user.full_name || user.username || '',
    );
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.end(buffer);
  }

  /** Live panel completion report data for on-screen executive preview. */
  @Get('frames/:id/completion-report')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'ops_director', 'system_admin', 'qaqc_engineer', 'wiring_technician')
  async frameCompletionReport(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    if (user.role === 'wiring_technician' && !(await this.svc.technicianAssignedToProject(code, user.id))) {
      throw new ForbiddenException('You are not assigned to this project');
    }
    return this.wiringDoc.getPanelCompletionReportData(
      code,
      id,
      user.full_name || user.username || '',
    );
  }

  @Delete('frames/:id')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  remove(@Param('code') code: string, @Param('id') id: string) { return this.svc.remove(code, id); }

  @Get('frames/:id/delete-precheck')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  deleteFramePrecheck(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.deleteFramePrecheck(code, id);
  }

  @Post('frames/:id/delete-guarded')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  deleteFrameGuarded(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body('confirmed_phrase') phrase: string,
  ) {
    return this.svc.deleteFrameGuarded(code, id, (phrase || '').trim());
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
  @UseInterceptors(FileInterceptor('file'))
  compareSourceFile(
    @Param('code') code: string, @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
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
    return this.svc.getDrawings(code);
  }

  /**
   * Modern UI contract (donor 0605265): stable panel GA package.
   * Express Phase A adapter — returns 2D-only shape; 3D slot always empty/disabled.
   * Full twin-layouts package persistence still uses legacy drawings until Express
   * uploadPanelDrawingAsset is ported; empty package lets the modal open safely.
   */
  @Get('frames/:id/drawing')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician', 'system_admin', 'ops_director', 'qaqc_engineer')
  async getPanelDrawingPackage(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.svc.findOne(code, id);
    if (user.role === 'wiring_technician') {
      await this.assertTechnicianProjectAccess(user, code);
    }
    const legacy = this.svc.getDrawings(code).filter((d: any) => !d.frame_id || d.frame_id === id);
    const drawing2d = legacy[0]
      ? {
          id: legacy[0].id,
          kind: '2d',
          original_name: legacy[0].original_name || legacy[0].filename || 'GA Drawing',
          content_type: legacy[0].content_type || 'application/pdf',
          uploaded_at: legacy[0].uploaded_at || null,
        }
      : null;
    const supervisor = user.role === 'prod_supervisor' || user.role === 'system_admin';
    return {
      project_code: code,
      frame_id: id,
      drawing_2d: drawing2d,
      model_3d: null,
      permissions: {
        can_view: true,
        can_upload_2d: supervisor && !drawing2d,
        can_replace_2d: supervisor && !!drawing2d,
        can_upload_3d: false,
        can_replace_3d: false,
        can_download_2d: supervisor && !!drawing2d,
        can_download_3d: false,
      },
    };
  }

  @Get('frames/:id/drawings')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'wiring_technician', 'system_admin', 'ops_director', 'qaqc_engineer')
  async getPanelDrawingsList(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.svc.findOne(code, id);
    if (user.role === 'wiring_technician') {
      await this.assertTechnicianProjectAccess(user, code);
    }
    return this.svc.getDrawings(code).filter((d: any) => !d.frame_id || d.frame_id === id);
  }

  // Additive read-only: stream a drawing file inline. Technicians may open it ONLY if they have an
  // assignment on this project; other authenticated roles per existing rules. No schema change.
  @Get('drawings/:id/file')
  async drawingFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    try {
      await this.assertTechnicianProjectAccess(user, code);
    } catch {
      res.status(403).json({ statusCode: 403, message: 'You are not assigned to this project' });
      return;
    }
    const file = this.svc.getDrawingFile(code, id);
    if (!file) {
      res.status(404).json({ statusCode: 404, message: 'Drawing not found' });
      return;
    }
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Content-Length': String(file.buffer.length),
    });
    res.end(file.buffer);
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
    @Res() res: Response,
  ) {
    this.assertTechnicianDenied(user);
    const file = this.svc.getDirectorReportFile(code, id);
    if (!file) {
      res.status(404).json({ statusCode: 404, message: 'Director report not found' });
      return;
    }
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Content-Length': String(file.buffer.length),
    });
    res.end(file.buffer);
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
}
