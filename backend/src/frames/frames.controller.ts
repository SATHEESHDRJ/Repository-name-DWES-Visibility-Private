import { Controller, Get, Post, Delete, Body, Param, UseGuards, Res, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
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
  findAll(@Param('code') code: string) { return this.svc.findAll(code); }

  @Get('frames/:id')
  findOne(@Param('code') code: string, @Param('id') id: string) { return this.svc.findOne(code, id); }

  /** Read-only complete paper-style wiring schedule PDF (all cable rows + optional GA appendix).
   *  Open to every role; technicians only for projects they are assigned to. */
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
    const { buffer, filename } = await this.wiringDoc.generateFrameDocument(
      code,
      id,
      user.full_name || user.username || '',
    );
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.end(buffer);
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
  compareStatus(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.getCompareStatus(code, id);
  }

  // ── Verification endpoints ─────────────────────────────────────────────────

  @Get('frames/:id/verify-data')
  verifyData(@Param('code') code: string, @Param('id') id: string) {
    return this.svc.verifyData(code, id);
  }

  @Post('frames/:id/patch-cable')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  patchCable(
    @Param('code') code: string, @Param('id') id: string,
    @Body() body: { cable_index: number; field: string; value: string },
  ) { return this.svc.patchCable(code, id, body.cable_index, body.field, body.value); }

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
  getMapping(@Param('code') code: string, @Param('id') id: string) {
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
  getCables(@Param('code') code: string) { return this.svc.getCables(code); }

  @Get('drawings')
  getDrawings(@Param('code') code: string) { return this.svc.getDrawings(code); }

  // Additive read-only: stream a drawing file inline. Technicians may open it ONLY if they have an
  // assignment on this project; other authenticated roles per existing rules. No schema change.
  @Get('drawings/:id/file')
  async drawingFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    if (user.role === 'wiring_technician') {
      const allowed = await this.svc.technicianAssignedToProject(code, user.id);
      if (!allowed) {
        res.status(403).json({ statusCode: 403, message: 'You are not assigned to this project' });
        return;
      }
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
  getDirectorReports(@Param('code') code: string) { return this.svc.getDirectorReports(code); }

  @Get('director-reports/:id/file')
  async directorReportFile(
    @Param('code') code: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
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
}
