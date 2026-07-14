import {
  Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, Res,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { SupervisorService } from './supervisor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, MockStore } from '../data/mock-store';
import { buildPanelReportFilename } from '../common/report-filename';
import { FrameStore } from '../frames/frame-store';

@Controller('api/supervisor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer')
export class SupervisorController {
  constructor(private svc: SupervisorService) {}

  @Get('all-panels')
  allPanels() { return this.svc.allPanels(); }

  @Get('review-panels/:code')
  reviewPanels(@Param('code') code: string) { return this.svc.reviewPanels(code); }

  @Get('panel-detail/:id')
  panelDetail(@Param('id', ParseIntPipe) id: number) { return this.svc.panelDetail(id); }

  @Post('review/:id')
  @Roles('prod_supervisor')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { review_status: string; review_notes?: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.review(id, body.review_status, body.review_notes || '', user.id);
  }

  @Get('pending-approvals')
  pendingApprovals() { return this.svc.pendingApprovals(); }

  @Post('approve-assignment/:id')
  @Roles('prod_supervisor')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.svc.approve(id, user);
  }

  @Post('rework-assignment/:id')
  @Roles('prod_supervisor')
  rework(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.requestRework(id, body.reason, user);
  }

  @Get('pending-changeovers')
  pendingChangeovers() { return this.svc.pendingChangeovers(); }

  @Get('changeover-candidate/:code/:frameId')
  changeoverCandidate(@Param('code') code: string, @Param('frameId') frameId: string) {
    return this.svc.changeoverCandidate(code, frameId);
  }

  @Post('mid-changeover')
  @Roles('prod_supervisor')
  midChangeover(
    @Body() body: {
      old_assignment_id: number;
      new_technician_id: number;
      changeover_reason: string;
      reason_notes?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.svc.midChangeover(
      body.old_assignment_id,
      body.new_technician_id,
      user.id,
      body.changeover_reason,
      body.reason_notes || '',
    );
  }

  // Full completion report for any assignment — supervisor / admin view
  @Get('completion-report/:id')
  completionReport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.completionReport(id);
  }

  // Live wiring progress for a frame — polled by supervisor view every ~12 s
  @Get('frame-progress/:code/:frameId')
  frameProgress(@Param('code') code: string, @Param('frameId') frameId: string) {
    return this.svc.frameProgress(code, frameId);
  }

  @Get('wiring-schedule/:code/:frameId/xlsx')
  async wiringScheduleXlsx(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @Res() res: FastifyReply,
  ) {
    const buffer = await this.svc.wiringScheduleXlsx(code, frameId) as Buffer;
    const filename = `${code}_${frameId}_wiring_schedule.xlsx`;
    res.headers({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  @Get('panel-report/:code/:frameId/xlsx')
  async panelReportXlsx(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @Res() res: FastifyReply,
  ) {
    const buffer = await this.svc.panelReportXlsx(code, frameId);
    const frame = MockStore.findFrameByProjectAndId(code, frameId)
      ?? FrameStore.getFrameFromDisk(code, frameId);
    const filename = buildPanelReportFilename({
      projectCode: code,
      panelName: frame?.panel_name || frameId,
      ext: 'xlsx',
    });
    res.headers({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  @Get('panel-report/:code/:frameId')
  panelReport(@Param('code') code: string, @Param('frameId') frameId: string) {
    return this.svc.panelReport(code, frameId);
  }

  @Post('panel-report/:code/:frameId/revalidate')
  @Roles('prod_supervisor')
  revalidate(@Param('code') code: string, @Param('frameId') frameId: string) {
    return this.svc.revalidate(code, frameId);
  }

  @Post('panel-report/:code/:frameId/confirm-revalidation')
  @Roles('prod_supervisor')
  confirmRevalidation(@Param('code') code: string, @Param('frameId') frameId: string, @CurrentUser() user: User) {
    return this.svc.confirmRevalidation(code, frameId, user);
  }
}
