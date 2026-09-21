import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../data/mock-store';
import { DrawingTbAnalysisService } from './drawing-tb-analysis.service';
import { AutomaticTbMarkerService } from './automatic-tb-marker.service';
import { CompletedLiveTbReportService } from './completed-live-tb-report.service';
import { FrameStore } from '../frames/frame-store';
import {
  classifyLiveTbVerdict,
  isLiveTbDebugEnabled,
  liveTbServerDebug,
  agentDebugLog,
} from './live-tb-debug';
import { FORBIDDEN_TECHNICIAN_TECHNICAL_MESSAGE } from './live-tb-contracts';
import * as fs from 'fs';
import * as path from 'path';

@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DrawingTbAnalysisController {
  constructor(
    private readonly analysis: DrawingTbAnalysisService,
    private readonly markers: AutomaticTbMarkerService,
    private readonly report: CompletedLiveTbReportService,
  ) {}

  /**
   * Client debug sink. Always forwards to agent ingest; NDJSON file only when DWES_LIVE_TB_DEBUG=1.
   */
  @Post('debug/client-log')
  @Roles('system_admin', 'prod_supervisor', 'wiring_technician', 'ops_director', 'qaqc_engineer')
  clientLog(@Body() body: Record<string, unknown>, @CurrentUser() _user: User) {
    const data = {
      ...(typeof body.data === 'object' && body.data ? (body.data as Record<string, unknown>) : {}),
      hypothesisId: body.hypothesisId,
      runId: body.runId,
    };
    // #region agent log
    agentDebugLog(
      String(body.location || 'client'),
      String(body.message || 'client-log'),
      data,
      String(body.hypothesisId || 'FE'),
      String(body.runId || 'post-repro'),
    );
    // #endregion
    if (isLiveTbDebugEnabled()) {
      liveTbServerDebug({
        location: String(body.location || 'client'),
        message: String(body.message || 'client-log'),
        verdict: body.verdict as string | undefined,
        failed_stage: body.failed_stage as string | undefined,
        data,
      });
    }
    return { ok: true, debug: true };
  }

  @Get('projects/:code/frames/:frameId/tb-analysis/status')
  @Roles('system_admin', 'prod_supervisor', 'wiring_technician', 'ops_director', 'qaqc_engineer')
  async status(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
  ) {
    const panel = await this.analysis.getPanelStatus(code, frameId);
    const run = await this.analysis.getLatestStatus(code, frameId);
    const summary = (run?.result_summary || {}) as Record<string, unknown>;
    const classified = classifyLiveTbVerdict({
      scheduleDrawingMismatch:
        panel.panel_status === 'SCHEDULE_DRAWING_MISMATCH'
        || summary.schedule_drawing_mismatch === true,
      headersLegendOnly: Array.isArray(summary.headers_legend_only)
        ? (summary.headers_legend_only as string[])
        : [],
      headersUnresolved: Array.isArray(summary.headers_unresolved)
        ? (summary.headers_unresolved as string[])
        : [],
      analysisFailed: panel.panel_status === 'TECHNICAL_FAILURE',
    });

    const isSupervisor =
      user.role === 'prod_supervisor' || user.role === 'system_admin';

    let techFailureReason: string | null = null;
    if (isSupervisor) {
      techFailureReason = run?.failure_reason || null;
    } else if (panel.panel_status === 'SCHEDULE_DRAWING_MISMATCH') {
      techFailureReason =
        'SCHEDULE_DRAWING_MISMATCH: The TB listed in the wiring schedule was not found in the assigned panel GA drawing.';
    } else if (panel.panel_status === 'TECHNICAL_FAILURE' || run?.status === 'TECHNICAL_FAILURE' || run?.status === 'FAILED') {
      // Technician-safe reason (no internal OCR stage dumps). Spec: never leave FAILED bare.
      techFailureReason =
        'Automatic TB-location analysis failed. Verified physical mappings still display when available.';
    }
    // Technicians never receive raw TECHNICAL_FAILURE stage dumps.

    const payload = {
      status: run?.status || 'UNCONFIGURED',
      panel_status: panel.panel_status,
      failed_stage: isSupervisor ? panel.failed_stage : (
        panel.panel_status === 'SCHEDULE_DRAWING_MISMATCH'
          ? 'excel_ga_cross_verification'
          : 'none'
      ),
      drawing_revision: run?.drawing_revision || null,
      drawing_checksum: panel.drawing_checksum,
      result_summary: run?.result_summary || null,
      failure_reason: techFailureReason,
      updated_at: run?.updated_at || null,
      usable_tb_groups: panel.usable_tb_groups,
      ...(isLiveTbDebugEnabled() && isSupervisor
        ? {
            debug: {
              verdict: classified.verdict,
              failed_stage: classified.failed_stage,
              forbidden_technician_message: FORBIDDEN_TECHNICIAN_TECHNICAL_MESSAGE,
            },
          }
        : {}),
    };
    liveTbServerDebug({
      location: 'drawing-tb-analysis.controller.ts:status',
      message: 'tb-analysis status served',
      project_code: code,
      frame_id: frameId,
      verdict: classified.verdict,
      failed_stage: panel.failed_stage,
      data: {
        status: payload.status,
        panel_status: payload.panel_status,
        failureReason: String(payload.failure_reason || '').slice(0, 180),
        mismatch: summary.schedule_drawing_mismatch ?? null,
        usable: panel.usable_tb_groups,
      },
    });
    return payload;
  }

  /** Nine-gate diagnostic — Supervisor/admin (or DWES_LIVE_TB_DEBUG=1). */
  @Get('projects/:code/frames/:frameId/tb-analysis/gates')
  @Roles('system_admin', 'prod_supervisor')
  async gates(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() _user: User,
  ) {
    return this.analysis.buildGates(code, frameId);
  }

  @Get('projects/:code/frames/:frameId/tb-analysis/panel-status')
  @Roles('system_admin', 'prod_supervisor', 'wiring_technician', 'ops_director', 'qaqc_engineer')
  async panelStatus(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() _user: User,
  ) {
    return this.analysis.getPanelStatus(code, frameId);
  }

  /**
   * Enqueue (or run inline) automatic TB detection for an already-uploaded GA package.
   * Does not modify the GA file. Supervisor/admin only.
   */
  @Post('projects/:code/frames/:frameId/tb-analysis/run')
  @Roles('system_admin', 'prod_supervisor')
  async runAnalysis(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
  ) {
    const pkg = FrameStore.getDrawingPackage(code, frameId);
    const asset = pkg?.drawing_2d;
    if (!pkg || !asset?.id || !asset?.sha256) {
      throw new NotFoundException('GA drawing (2d) is not available for this panel.');
    }
    const previous = await this.analysis.getLatestStatus(code, frameId);
    const result = await this.analysis.enqueueAfterDrawingUpload({
      projectCode: code,
      frameId,
      requestedBy: user.id,
      packageRevision: Number(pkg.revision || 1),
      sha256: String(asset.sha256),
      drawingAssetId: String(asset.id),
      previousSha256: previous?.drawing_checksum || null,
    });
    const run = await this.analysis.getLatestStatus(code, frameId);
    liveTbServerDebug({
      location: 'drawing-tb-analysis.controller.ts:run',
      message: 'tb-analysis run enqueued',
      project_code: code,
      frame_id: frameId,
      failed_stage: 'analysis_job_creation',
      data: { runId: result.runId, checksum: asset.sha256 },
    });
    return {
      runId: result.runId,
      jobId: result.jobId,
      status: run?.status || 'ANALYSIS_PENDING',
      drawing_checksum: asset.sha256,
      drawing_revision: String(pkg.revision || 1),
    };
  }

  @Post('projects/:code/frames/:frameId/tb-analysis/verify')
  @Roles('system_admin', 'prod_supervisor')
  async verifyCandidate(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: User,
  ) {
    const action = String(body.action || '');
    if (!['confirm', 'correct', 'reject', 'not_in_ga'].includes(action)) {
      throw new BadRequestException('action must be confirm|correct|reject|not_in_ga');
    }
    const tbNumber = String(body.tb_number || '').trim();
    if (!tbNumber) throw new BadRequestException('tb_number required');
    const geometry = (body.geometry || {}) as Record<string, number>;
    if (
      (action === 'confirm' || action === 'correct')
      && !(
        Number.isFinite(geometry.x)
        && Number.isFinite(geometry.y)
        && Number.isFinite(geometry.width)
        && Number.isFinite(geometry.height)
      )
    ) {
      throw new BadRequestException('geometry {x,y,width,height} required for confirm/correct');
    }
    return this.analysis.confirmPendingCandidate({
      projectCode: code,
      frameId,
      userId: user.id,
      tbNumber,
      pageNumber: Number(body.page_number || 1),
      geometry: {
        x: Number(geometry.x || 0),
        y: Number(geometry.y || 0),
        width: Number(geometry.width || 0.08),
        height: Number(geometry.height || 0.12),
        rotation: Number(geometry.rotation || 0),
      },
      terminalGroup: body.terminal_group ? String(body.terminal_group) : undefined,
      action: action as 'confirm' | 'correct' | 'reject' | 'not_in_ga',
    });
  }

  @Get('projects/:code/frames/:frameId/tb-analysis/debug-export')
  @Roles('system_admin', 'prod_supervisor')
  async debugExport(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() _user: User,
    @Res() res: FastifyReply,
  ) {
    const ndjson = await this.analysis.exportDebugNdjson(code, frameId);
    res.header('Content-Type', 'application/x-ndjson');
    res.header(
      'Content-Disposition',
      `attachment; filename="live-tb-debug-${code}-${frameId}.ndjson"`,
    );
    return res.send(ndjson);
  }

  /**
   * Dev-only: seed known-geometry baseline markers (G7–G9 proof).
   * Requires DWES_LIVE_TB_BASELINE=1. Never creates production HIGH / AUTO_VERIFIED.
   */
  @Post('projects/:code/frames/:frameId/tb-analysis/dev-baseline')
  @Roles('system_admin', 'prod_supervisor')
  async seedDevBaseline(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
  ) {
    if (process.env.DWES_LIVE_TB_BASELINE !== '1') {
      throw new ForbiddenException('DWES_LIVE_TB_BASELINE=1 required');
    }
    const fixturePath = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'live-tb-baseline',
      'panel-001-wire-030.json',
    );
    const alt = path.join(
      __dirname,
      '..',
      '..',
      'test',
      'fixtures',
      'live-tb-baseline',
      'panel-001-wire-030.json',
    );
    const file = fs.existsSync(fixturePath) ? fixturePath : alt;
    if (!fs.existsSync(file)) {
      throw new NotFoundException(`Baseline fixture missing at ${file}`);
    }
    const fixture = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      drawing_checksum: string;
      markers: Array<{
        tb_number: string;
        page_number: number;
        terminal_group: string;
        geometry: { x: number; y: number; width: number; height: number; rotation?: number };
      }>;
    };
    const pkg = FrameStore.getDrawingPackage(code, frameId);
    const checksum = String(pkg?.drawing_2d?.sha256 || fixture.drawing_checksum);
    const created = await this.markers.persistDevBaselineMarkers({
      projectCode: code,
      frameId,
      drawingRevision: String(pkg?.revision || 1),
      drawingChecksum: checksum,
      createdBy: user.id,
      markers: fixture.markers || [],
    });
    return { ok: true, created_ids: created, checksum, note: 'DEV_BASELINE_FIXTURE' };
  }

  @Get('projects/:code/frames/:frameId/tb-groups')
  @Roles('system_admin', 'prod_supervisor', 'wiring_technician', 'ops_director', 'qaqc_engineer')
  async listGroups(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @Query('checksum') checksum: string | undefined,
    @CurrentUser() _user: User,
  ) {
    const pkg = FrameStore.getDrawingPackage(code, frameId);
    const sha = checksum || pkg?.drawing_2d?.sha256 || null;
    const rows = await this.markers.listActiveGroups(code, frameId, sha);
    return {
      drawing_revision: pkg ? String(pkg.revision) : null,
      drawing_checksum: sha,
      groups: rows.map(m => ({
        id: m.id,
        tb_number: m.tb_number,
        terminal_group: m.terminal_group,
        page_number: m.page_number,
        view_name: m.view_name,
        geometry: m.geometry,
        detection_method: (m as any).detection_method,
        confidence_score: (m as any).confidence_score,
        notes: (m as any).notes,
      })),
    };
  }

  @Get('projects/:code/frames/:frameId/tb-completion-overview')
  @Roles('system_admin', 'prod_supervisor', 'wiring_technician', 'ops_director', 'qaqc_engineer')
  async completionOverview(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() _user: User,
  ) {
    return this.report.buildOverview(code, frameId);
  }

  @Post('projects/:code/frames/:frameId/tb-completion-report')
  @Roles('system_admin', 'prod_supervisor', 'wiring_technician', 'ops_director')
  async completionReport(
    @Param('code') code: string,
    @Param('frameId') frameId: string,
    @CurrentUser() user: User,
    @Res() res: FastifyReply,
  ) {
    const pdf = await this.report.generatePdf(code, frameId, user.id);
    if (!pdf) throw new NotFoundException('Unable to generate Completed LIVE TB Report');
    res.header('Content-Type', 'application/pdf');
    res.header(
      'Content-Disposition',
      `attachment; filename="LIVE-TB-Completion-${code}-${frameId}.pdf"`,
    );
    return res.send(pdf);
  }
}
