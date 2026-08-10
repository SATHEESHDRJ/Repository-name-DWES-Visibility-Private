import {
  Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Query, UseGuards, BadRequestException, NotFoundException, Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { TechService } from './tech.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FastifySchema } from '../common/decorators/fastify-schema.decorator';
import { AssignPanelDto } from '../common/dto/fastify-schemas.dto';
import { User } from '../data/mock-store';
import * as fs from 'fs';

@Controller('api/tech')
@UseGuards(JwtAuthGuard)
export class TechController {
  constructor(private svc: TechService) {}

  // ── Supervisor actions ──────────────────────────────────────────────────────

  @Post('assign-frame')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  @FastifySchema({
    body: {
      type: 'object',
      required: ['project_code', 'frame_id', 'technician_id'],
      properties: {
        project_code: { type: 'string', minLength: 1 },
        frame_id: { type: 'string', minLength: 1 },
        technician_id: { type: 'integer', minimum: 1 },
      },
    },
  })
  assignFrame(@Body() dto: AssignPanelDto, @CurrentUser() user: User) {
    return this.svc.assignFrame({ ...dto, assigned_by_id: user.id });
  }

  @Get('audit/:code')
  @UseGuards(RolesGuard)
  // sales_director excluded — the audit trail exposes technician names, pause
  // reasons and per-cable remarks, which the aggregate sales view must not receive.
  @Roles('system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer')
  audit(@Param('code') code: string) { return this.svc.audit(code); }

  @Delete('assignment/:id')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  deleteAssignment(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteAssignment(id); }

  // ── Technician actions ──────────────────────────────────────────────────────

  @Get('my-panels')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  myPanels(@CurrentUser() user: User) { return this.svc.myPanels(user.id); }

  @Get('my-assignment/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  myAssignmentDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.myAssignmentDetail(id, user.id);
  }

  @Get('mid-change/targets')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  midChangeTargets(@CurrentUser() user: User) {
    return this.svc.midChangeTargets(user.id);
  }

  @Get('mid-change/requests')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  midChangeRequests(@CurrentUser() user: User) {
    return this.svc.midChangeRequests(user.id);
  }

  @Post('mid-change/execute')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  executeMidChange(
    @Body() body: { source_assignment_id: number; target_technician_id: number; reason: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.executeMidChange(
      user.id,
      Number(body.source_assignment_id),
      Number(body.target_technician_id),
      body.reason || '',
    );
  }

  @Post('start/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  start(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.start(id, user.id);
  }

  @Post('pause/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  pause(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { elapsed_seconds: number; reason: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.pause(id, user.id, body.elapsed_seconds || 0, body.reason || '');
  }

  @Post('resume/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  resume(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.resume(id, user.id);
  }

  @Post('complete/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.complete(id, user.id);
  }

  /** Reopen a completed panel for rework (owning technician only; progress preserved). */
  @Post('rework/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  rework(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.rework(id, user.id, body?.reason || '');
  }

  @Post('cable-status')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  cableStatus(
    @Body() body: { assignment_id: number; cable_index: number; field: 'src' | 'dst' | 'note' | 'issue'; value: boolean | string },
    @CurrentUser() user: User,
  ) {
    return this.svc.updateCableStatus(body.assignment_id, user.id, body.cable_index, body.field, body.value);
  }

  @Post('cable-action')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  cableAction(
    @Body() body: {
      assignment_id: number;
      cable_index: number;
      action: 'complete' | 'src_only' | 'dst_only' | 'reset_all' | 'skip' | 'flag_issue' | 'source_end_open' | 'destination_end_open';
      note?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.svc.cableAction(body.assignment_id, user.id, body.cable_index, body.action, body.note || '');
  }

  @Post('cable-correction')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  correctCable(
    @Body() body: {
      assignment_id: number;
      cable_index: number;
      field: string;
      corrected_value: string;
      reason: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.svc.correctCable(
      Number(body.assignment_id),
      user.id,
      Number(body.cable_index),
      body.field || '',
      body.corrected_value ?? '',
      body.reason || '',
    );
  }

  @Get('cable-corrections/:id/excel')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician', 'prod_supervisor', 'qaqc_engineer', 'ops_director', 'system_admin')
  async downloadCorrectedExcel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    const file = await this.svc.downloadCorrectedExcel(id, { id: user.id, role: user.role });
    const safeAscii = String(file.filename || 'wiring_schedule.xlsx').replace(/[^\x20-\x7E]/g, '_');
    const utf8Name = encodeURIComponent(String(file.filename || 'wiring_schedule.xlsx'));
    res.header('Content-Type', file.contentType);
    res.header(
      'Content-Disposition',
      `attachment; filename="${safeAscii}"; filename*=UTF-8''${utf8Name}`,
    );
    res.header('X-DWES-Corrected-Excel-Path', file.displayPath);
    res.header('Access-Control-Expose-Headers', 'Content-Disposition, X-DWES-Corrected-Excel-Path');
    return res.send(fs.createReadStream(file.absolutePath));
  }

  @Get('cable-corrections/:id/excel-preview')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician', 'prod_supervisor', 'qaqc_engineer', 'ops_director', 'system_admin')
  previewCorrectedExcel(
    @Param('id', ParseIntPipe) id: number,
    @Query('wireNumber') wireNumber: string | undefined,
    @Query('focusField') focusField: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.svc.previewCorrectedExcel(id, { id: user.id, role: user.role }, wireNumber, focusField);
  }

  @Get('cable-corrections/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician', 'prod_supervisor', 'qaqc_engineer', 'ops_director', 'system_admin')
  cableCorrections(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.svc.cableCorrections(id, { id: user.id, role: user.role });
  }

  @Get('cable-corrections/:id/:cableIndex')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician', 'prod_supervisor', 'qaqc_engineer', 'ops_director', 'system_admin')
  cableCorrectionsForWire(
    @Param('id', ParseIntPipe) id: number,
    @Param('cableIndex', ParseIntPipe) cableIndex: number,
    @CurrentUser() user: User,
  ) {
    return this.svc.cableCorrections(id, { id: user.id, role: user.role }, cableIndex);
  }

  /** DEMO_MODE only — bulk mark/reset helpers for dev testing (404 in production). */
  @Post('dev/cable-bulk/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  devCableBulk(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { action: 'mark_all_verified' | 'mark_all_with_issues' | 'reset_all' },
    @CurrentUser() user: User,
  ) {
    if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
    return this.svc.devCableBulk(id, user.id, body.action);
  }

  @Get('report/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  report(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.report(id, user.id);
  }

  @Get('completion-report/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  completionReport(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.completionReport(id, user.id);
  }

  @Post('submit-report/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  submitReport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() body: { notes?: string },
  ) {
    return this.svc.submitReport(id, user.id, body?.notes);
  }

  @Post('hide/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  hide(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.hide(id, user.id);
  }

  @Post('verify-otp/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  verifyOtp(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { code: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.verifyOtp(id, user.id, body.code || '');
  }

  @Get('qr/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  getQr(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.getQrData(id, user.id);
  }

  @Post('scan-qr')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  scanQr(@Body() body: { qr_data: string }, @CurrentUser() user: User) {
    return this.svc.scanQr(user.id, body.qr_data || '');
  }

  @Get('dev/otp-hint/:id')
  devOtpHint(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    if (process.env.NODE_ENV === 'production' && process.env.WSM_DEV_MODE !== 'true') {
      throw new BadRequestException('Dev OTP hints are disabled in production');
    }
    return this.svc.devOtpHint(id, user.id, user.role || '');
  }
}
