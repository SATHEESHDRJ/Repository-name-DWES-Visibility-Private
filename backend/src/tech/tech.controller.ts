import {
  Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { TechService } from './tech.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../data/mock-store';

@Controller('api/tech')
@UseGuards(JwtAuthGuard)
export class TechController {
  constructor(private svc: TechService) {}

  // ── Supervisor actions ──────────────────────────────────────────────────────

  @Post('assign-frame')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor', 'system_admin', 'ops_director', 'qaqc_engineer')
  assignFrame(@Body() dto: { project_code: string; frame_id: string; technician_id: number }, @CurrentUser() user: User) {
    return this.svc.assignFrame({ ...dto, assigned_by_id: user.id });
  }

  @Post('changeover')
  @UseGuards(RolesGuard)
  @Roles('prod_supervisor')
  changeover(
    @Body() body: {
      old_assignment_id: number;
      new_technician_id: number;
      changeover_reason?: string;
      reason_notes?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.svc.changeover(
      body.old_assignment_id,
      body.new_technician_id,
      user.id,
      body.changeover_reason || '',
      body.reason_notes || '',
    );
  }

  @Get('audit/:code')
  @UseGuards(RolesGuard)
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

  @Get('my-assignment/:id')
  @UseGuards(RolesGuard)
  @Roles('wiring_technician')
  myAssignmentDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.myAssignmentDetail(id, user.id);
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
    @Body() body: { assignment_id: number; cable_index: number; action: 'complete' | 'src_only' | 'dst_only' | 'reset_all'; note?: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.cableAction(body.assignment_id, user.id, body.cable_index, body.action, body.note || '');
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
