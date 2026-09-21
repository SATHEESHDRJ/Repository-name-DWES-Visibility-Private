import {
  Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards, Res,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { SupervisorService } from './supervisor.service';
import { TechService } from '../tech/tech.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, MockStore } from '../data/mock-store';
import { buildPanelReportFilename } from '../common/report-filename';
import { FrameStore } from '../frames/frame-store';

@Controller('api/supervisor')
@UseGuards(JwtAuthGuard, RolesGuard)
// sales_director excluded: supervisor payloads carry technician names and pause
// details, which the sales view must never receive (aggregate KPIs only).
@Roles('system_admin', 'prod_supervisor', 'ops_director', 'qaqc_engineer')
export class SupervisorController {
  constructor(
    private svc: SupervisorService,
    private tech: TechService,
  ) {}

  @Get('all-panels')
  allPanels() { return this.svc.allPanels(); }

  @Get('project-live-summary')
  projectLiveSummary() { return this.svc.projectLiveSummary(); }

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
      Number(body?.old_assignment_id),
      Number(body?.new_technician_id),
      user.id,
      String(body?.changeover_reason || ''),
      String(body?.reason_notes || ''),
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

  @Get('panel-activity/:code/:frameId')
  panelActivity(@Param('code') code: string, @Param('frameId') frameId: string) {
    return this.svc.panelActivity(code, frameId);
  }

  @Post('reassign-before-start')
  @Roles('prod_supervisor')
  reassignBeforeStart(
    @Body() body: { assignment_id: number; new_technician_id: number; reason: string },
    @CurrentUser() user: User,
  ) {
    return this.svc.reassignBeforeStart(
      Number(body?.assignment_id),
      Number(body?.new_technician_id),
      user.id,
      String(body?.reason || ''),
    );
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

  @Get('crimping/:assignmentId')
  crimpingSummary(@Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.tech.getCrimpingSummaryForManagers(assignmentId);
  }

  /** Real Cut/Strip/Crimp portfolio from persisted assignment cable_status — never invented. */
  @Get('crimping-portfolio')
  crimpingPortfolio(@Query('project_code') project_code?: string) {
    return this.tech.getPrepPortfolioForManagers(project_code);
  }

  @Get('crimping-report/:assignmentId')
  crimpingReport(@Param('assignmentId', ParseIntPipe) assignmentId: number) {
    return this.tech.getCrimpingReportForManagers(assignmentId);
  }

  @Post('crimping/:assignmentId/required')
  @Roles('prod_supervisor', 'system_admin')
  setCrimpingRequired(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() body: { cable_indexes: number[]; required: boolean },
    @CurrentUser() user: User,
  ) {
    return this.tech.setCrimpingRequiredForAssignment(
      assignmentId,
      user.id,
      Array.isArray(body?.cable_indexes) ? body.cable_indexes : [],
      Boolean(body?.required),
    );
  }

  @Post('crimping/:assignmentId/qa-hold')
  @Roles('prod_supervisor', 'qaqc_engineer', 'system_admin')
  setQaHold(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() body: { cable_indexes: number[]; qa_hold: boolean },
    @CurrentUser() user: User,
  ) {
    return this.tech.setQaHoldForAssignment(
      assignmentId,
      user.id,
      Array.isArray(body?.cable_indexes) ? body.cable_indexes : [],
      Boolean(body?.qa_hold),
    );
  }

  @Post('crimping/:assignmentId/rework')
  @Roles('prod_supervisor', 'qaqc_engineer', 'system_admin')
  setCrimpingRework(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() body: {
      cable_index: number;
      end: 'source' | 'destination';
      operation: 'strip' | 'crimp';
      reason: string;
      affected_end?: 'SOURCE' | 'DESTINATION' | 'BOTH' | 'GENERAL';
    },
    @CurrentUser() user: User,
  ) {
    const affectedEnd = body?.affected_end;
    if (affectedEnd && ['SOURCE', 'DESTINATION', 'BOTH', 'GENERAL'].includes(affectedEnd)) {
      return this.tech.setCrimpingReworkWithAffectedEnd(
        assignmentId,
        user.id,
        Number(body?.cable_index),
        affectedEnd as 'SOURCE' | 'DESTINATION' | 'BOTH' | 'GENERAL',
        body?.operation === 'strip' ? 'strip' : 'crimp',
        String(body?.reason || ''),
        user.role,
      );
    }
    return this.tech.setCrimpingReworkForAssignment(
      assignmentId,
      user.id,
      Number(body?.cable_index),
      body?.end === 'destination' ? 'destination' : 'source',
      body?.operation === 'strip' ? 'strip' : 'crimp',
      String(body?.reason || ''),
      user.role,
    );
  }

  @Post('crimping/:assignmentId/resolve-legacy-partial')
  @Roles('prod_supervisor', 'system_admin')
  resolveLegacyPartial(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() body: { cable_index: number },
    @CurrentUser() user: User,
  ) {
    return this.tech.resolveLegacyPartialForAssignment(
      assignmentId,
      user.id,
      Number(body?.cable_index),
    );
  }

  @Get('crimping-report/:assignmentId/pdf')
  @Roles('prod_supervisor', 'ops_director', 'qaqc_engineer', 'system_admin')
  async crimpingReportPdf(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Res() res: any,
  ) {
    const report = await this.tech.getCrimpingReportForManagers(assignmentId);
    const { buildCrimpingReportPdf } = await import('../common/crimping-report-pdf');
    const buffer = await buildCrimpingReportPdf(report);
    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `attachment; filename="crimping-report-${assignmentId}.pdf"`);
    res.header('Content-Length', String(buffer.length));
    res.send(buffer);
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
