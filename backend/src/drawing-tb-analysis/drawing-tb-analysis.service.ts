import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JobQueueService } from '../ga-foundation/job-queue.service';
import type { BackgroundJobContext } from '../ga-foundation/ga-foundation.types';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { DrawingIntelligenceClient } from './drawing-intelligence.client';
import { AutomaticTbMarkerService } from './automatic-tb-marker.service';
import { AutomaticGaDeviceLocationService } from '../ga-device-locations/automatic-ga-device-location.service';
import type { DeviceDrawingHit } from '../ga-device-locations/device-location-analysis';
import { buildExpectedTbDictionary, buildExpectedTbHeaders, buildScheduleTbTerminalIndex } from './expected-headers';
import { liveTbServerDebug, classifyLiveTbVerdict } from './live-tb-debug';
import { classifyDrawingReadiness, probeWorkerHealth } from './drawing-readiness';
import { derivePanelLiveTbStatus } from './panel-live-tb-status';
import type { LiveTbFailedStage } from './live-tb-contracts';
import { LIVE_TB_PIPELINE_VERSION } from './live-tb-contracts';

const JOB_TYPE = 'drawing_tb_analysis';

@Injectable()
export class DrawingTbAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(DrawingTbAnalysisService.name);

  constructor(
    private readonly jobs: JobQueueService,
    private readonly prisma: PrismaService,
    private readonly intelligence: DrawingIntelligenceClient,
    private readonly autoMarkers: AutomaticTbMarkerService,
    private readonly autoDevices: AutomaticGaDeviceLocationService,
  ) {}

  onModuleInit(): void {
    try {
      this.jobs.registerHandler(JOB_TYPE, ctx => this.processAnalysis(ctx));
      this.logger.log(`Registered background handler ${JOB_TYPE}`);
    } catch (err: any) {
      this.logger.warn(`Handler register: ${err?.message || err}`);
    }
  }

  async enqueueAfterDrawingUpload(input: {
    projectCode: string;
    frameId: string;
    requestedBy: number;
    packageRevision: number;
    sha256: string;
    drawingAssetId: string;
    previousSha256?: string | null;
  }) {
    if (input.previousSha256 && input.previousSha256 !== input.sha256) {
      await this.autoMarkers.supersedeForChecksum(
        input.projectCode,
        input.frameId,
        input.previousSha256,
      );
    }

    const runId = randomUUID();
    try {
      await this.prisma.drawing_tb_analysis_runs.create({
        data: {
          id: runId,
          project_code: input.projectCode,
          frame_id: input.frameId,
          drawing_revision: String(input.packageRevision),
          drawing_checksum: input.sha256,
          status: 'ANALYSIS_PENDING',
        },
      });
    } catch (err: any) {
      this.logger.warn(`analysis_run create skipped: ${err?.message || err}`);
    }

    try {
      const job = await this.jobs.enqueue({
        jobType: JOB_TYPE,
        projectCode: input.projectCode,
        frameId: input.frameId,
        requestedBy: input.requestedBy,
        payload: {
          runId,
          drawingAssetId: input.drawingAssetId,
          packageRevision: input.packageRevision,
          sha256: input.sha256,
          previousSha256: input.previousSha256 || null,
        },
        maxAttempts: 2,
      });
      try {
        await this.prisma.drawing_tb_analysis_runs.update({
          where: { id: runId },
          data: { job_id: job.id, status: 'ANALYSIS_PENDING', updated_at: new Date() },
        });
      } catch {
        /* ignore */
      }
      return { runId, jobId: job.id };
    } catch (err: any) {
      this.logger.warn(`enqueue ${JOB_TYPE} failed: ${err?.message || err}`);
      // Process inline when job queue unavailable (dev / missing table)
      await this.processInline({
        runId,
        projectCode: input.projectCode,
        frameId: input.frameId,
        requestedBy: input.requestedBy,
        packageRevision: input.packageRevision,
        sha256: input.sha256,
        drawingAssetId: input.drawingAssetId,
      });
      return { runId, jobId: null };
    }
  }

  async getLatestStatus(projectCode: string, frameId: string) {
    try {
      const run = await this.prisma.drawing_tb_analysis_runs.findFirst({
        where: { project_code: projectCode, frame_id: frameId },
        orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
      });
      return run;
    } catch {
      return null;
    }
  }

  private async processAnalysis(context: BackgroundJobContext) {
    const payload = context.payload || {};
    await this.processInline({
      runId: String(payload.runId || context.id),
      projectCode: context.projectCode,
      frameId: context.frameId,
      requestedBy: context.requestedBy,
      packageRevision: Number(payload.packageRevision || 0),
      sha256: String(payload.sha256 || ''),
      drawingAssetId: String(payload.drawingAssetId || ''),
    });
    return {
      status: 'completed' as const,
      result: { runId: payload.runId },
    };
  }

  private async processInline(input: {
    runId: string;
    projectCode: string;
    frameId: string;
    requestedBy: number;
    packageRevision: number;
    sha256: string;
    drawingAssetId: string;
  }) {
    const setStatus = async (status: string, extra?: Record<string, unknown>) => {
      try {
        await this.prisma.drawing_tb_analysis_runs.update({
          where: { id: input.runId },
          data: {
            status,
            updated_at: new Date(),
            ...(extra?.failure_reason
              ? { failure_reason: String(extra.failure_reason).slice(0, 500) }
              : {}),
            ...(extra?.result_summary ? { result_summary: extra.result_summary as any } : {}),
            ...(extra?.expected_headers ? { expected_headers: extra.expected_headers as any } : {}),
          },
        });
      } catch {
        /* table may be absent until migration */
      }
    };

    await setStatus('ANALYSING');

    const frame =
      MockStore.findFrameByProjectAndId(input.projectCode, input.frameId) ||
      FrameStore.getFrameFromDisk(input.projectCode, input.frameId);
    const cables = (frame as any)?.cables || [];
    const mapping = (frame as any)?.mapping || null;
    const expectedHeaders = buildExpectedTbHeaders(cables, mapping);
    const expectedDictionary = buildExpectedTbDictionary(cables, mapping);
    const scheduleTerminalsByHeader = buildScheduleTbTerminalIndex(cables, mapping);
    await setStatus('ANALYSING', {
      expected_headers: expectedHeaders,
      result_summary: {
        pipeline_stage: 'QUEUED',
        pipeline_version: LIVE_TB_PIPELINE_VERSION,
        expected_tb_dictionary: expectedDictionary,
      },
    });

    const drawingMeta = MockStore.drawings.find(
      (d: any) => d.id === input.drawingAssetId || d.sha256 === input.sha256,
    );
    let drawingPath = '';
    if (drawingMeta?.id) {
      drawingPath = FrameStore.getDrawingFilePath(input.projectCode, drawingMeta.id) || '';
    }
    if (!drawingPath) {
      const pkg = FrameStore.getDrawingPackage(input.projectCode, input.frameId);
      const asset = pkg?.drawing_2d;
      if (asset?.id) {
        drawingPath = FrameStore.getDrawingFilePath(input.projectCode, asset.id) || '';
      }
    }

    const MAX_RECOVERABLE_RETRIES = 2;
    let retryCount = 0;
    let lastError: string | null = null;
    let result = await this.intelligence.analyse({
      projectCode: input.projectCode,
      frameId: input.frameId,
      drawingPath,
      drawingChecksum: input.sha256,
      drawingRevision: String(input.packageRevision),
      expectedHeaders,
      scheduleTerminalsByHeader,
      enrichment: false,
    });

    const isRecoverableWorkerFailure = (notes: string[]) =>
      notes.some(n =>
        /ocr_stage_failed|pdfjs_unavailable|worker|timeout|ECONNREFUSED|temporarily/i.test(String(n)),
      );

    while (
      retryCount < MAX_RECOVERABLE_RETRIES
      && isRecoverableWorkerFailure(result.notes || [])
      && !(result.candidates || []).length
    ) {
      retryCount += 1;
      lastError = (result.notes || []).slice(0, 3).join('|') || 'recoverable_worker_failure';
      await setStatus('ENRICHMENT_RETRY', {
        result_summary: {
          retry_count: retryCount,
          last_error: lastError,
          failed_stage: 'worker_startup',
          worker_health: await probeWorkerHealth(),
        },
      });
      result = await this.intelligence.analyse({
        projectCode: input.projectCode,
        frameId: input.frameId,
        drawingPath,
        drawingChecksum: input.sha256,
        drawingRevision: String(input.packageRevision),
        expectedHeaders,
        scheduleTerminalsByHeader,
        enrichment: retryCount > 0,
      });
    }

    // MEDIUM enrichment retry (bounded)
    const hasMedium = result.candidates.some(c => c.confidence === 'MEDIUM');
    if (hasMedium) {
      await setStatus('ENRICHMENT_RETRY');
      retryCount += 1;
      const enriched = await this.intelligence.analyse({
        projectCode: input.projectCode,
        frameId: input.frameId,
        drawingPath,
        drawingChecksum: input.sha256,
        drawingRevision: String(input.packageRevision),
        expectedHeaders,
        scheduleTerminalsByHeader,
        enrichment: true,
      });
      // Merge: prefer HIGH from either pass
      const byKey = new Map<string, (typeof result.candidates)[0]>();
      for (const c of [...result.candidates, ...enriched.candidates]) {
        const key = `${c.tb_number}|${c.page_number}|${c.terminal_group}`;
        const prev = byKey.get(key);
        if (!prev || (c.confidence === 'HIGH' && prev.confidence !== 'HIGH')) {
          byKey.set(key, c);
        }
      }
      result = { ...enriched, candidates: [...byKey.values()] };
      const found = new Set<string>([
        ...(result.headers_found || []),
        ...(enriched.headers_found || []),
      ].map(h => String(h).toUpperCase()));
      const missing = expectedHeaders
        .map(h => String(h).toUpperCase())
        .filter(h => !found.has(h));
      result = {
        ...result,
        headers_found: [...found],
        headers_missing: missing,
      };
    } else if (!result.headers_found && !result.headers_missing) {
      // Older engines may omit these fields — derive from candidates only.
      const found = new Set(result.candidates.map(c => normalizeHeader(c.tb_number)));
      result = {
        ...result,
        headers_found: [...found],
        headers_missing: expectedHeaders
          .map(h => normalizeHeader(h))
          .filter(h => !found.has(h)),
      };
    }

    const high = result.candidates.filter(c => c.confidence === 'HIGH');
    const reviewCandidates = result.candidates.filter(
      c => c.confidence === 'MEDIUM' || c.confidence === 'AMBIGUOUS',
    );
    const { saved } = await this.autoMarkers.persistHighCandidates({
      projectCode: input.projectCode,
      frameId: input.frameId,
      drawingRevision: String(input.packageRevision),
      drawingChecksum: input.sha256,
      analysisRunId: input.runId,
      createdBy: input.requestedBy || 0,
      candidates: high,
    });

    // Phase 9B: DEVICE location persistence contract (ga_device_locations).
    // Hits may arrive from worker as device_hits; absent → metrics only (targets from schedule).
    const deviceHits = Array.isArray((result as any).device_hits)
      ? ((result as any).device_hits as DeviceDrawingHit[])
      : [];
    const drawingIdNum =
      Number.parseInt(String(input.drawingAssetId).replace(/\D+/g, ''), 10)
      || Number((drawingMeta as any)?.numeric_id)
      || 0;
    let deviceMetrics = this.autoDevices.emptyMetrics();
    try {
      deviceMetrics = await this.autoDevices.persistFromAnalysis({
        cables,
        hits: deviceHits,
        currentDrawingChecksum: input.sha256,
        drawing_id: drawingIdNum,
        analysis_run_id: input.runId,
        pipeline_version: LIVE_TB_PIPELINE_VERSION,
        groundingUnavailable: !!(result as any).grounding_unavailable,
      });
    } catch (err: any) {
      this.logger.warn(`DEVICE location pipeline: ${err?.message || err}`);
    }

    const expectedCount = expectedHeaders.length;
    const highHeaders = new Set(high.map(h => normalizeHeader(h.tb_number)));
    const headersFound = (result.headers_found || []).map(normalizeHeader);
    const headersMissing = (result.headers_missing || []).map(normalizeHeader);
    const legendOnly = (result.headers_legend_only || []).map(normalizeHeader);
    const unresolved = (result.headers_unresolved || []).map(normalizeHeader);
    const scheduleDrawingMismatch =
      expectedCount > 0
      && headersFound.length === 0
      && reviewCandidates.length === 0;
    const needsSupervisorVerification =
      !scheduleDrawingMismatch
      && (reviewCandidates.length > 0 || (saved === 0 && unresolved.length > 0 && headersFound.length > 0));

    const workerHealth = await probeWorkerHealth();
    const readiness = classifyDrawingReadiness({
      drawingPath,
      pageTypes: result.page_types,
    });

    let failedStage: LiveTbFailedStage = 'none';
    let status = 'READY_FOR_LIVE_TB';
    let failure_reason: string | null = null;

    const technical =
      (result.notes || []).some(n =>
        /drawing_missing|ocr_stage_failed|pdfjs_unavailable|worker/i.test(String(n)),
      ) && headersFound.length === 0 && reviewCandidates.length === 0 && !scheduleDrawingMismatch;

    if (scheduleDrawingMismatch) {
      status = 'SCHEDULE_DRAWING_MISMATCH';
      failedStage = 'excel_ga_cross_verification';
      failure_reason =
        'SCHEDULE_DRAWING_MISMATCH: The TB listed in the wiring schedule was not found in the assigned panel GA drawing.';
    } else if (technical) {
      status = 'TECHNICAL_FAILURE';
      failedStage =
        workerHealth.ocr_python === 'missing' && readiness.searchable === false
          ? 'ocr'
          : workerHealth.pdfjs !== 'ok'
            ? 'pdf_reading'
            : 'worker_startup';
      failure_reason =
        `TECHNICAL_FAILURE: stage=${failedStage}; retries=${retryCount}; `
        + (lastError || (result.notes || []).slice(0, 3).join('|') || 'unknown');
    } else if (needsSupervisorVerification) {
      status = 'SUPERVISOR_VERIFICATION_REQUIRED';
      failedStage = 'physical_strip_detection';
      failure_reason = null;
    } else if (saved > 0 && highHeaders.size < expectedCount) {
      status = 'SUPERVISOR_VERIFICATION_REQUIRED';
      failedStage = 'marker_persistence';
      failure_reason = null;
    } else if (saved > 0) {
      status = 'READY_FOR_LIVE_TB';
      failedStage = 'none';
    } else if (expectedCount === 0) {
      // No expected physical TBs — not READY for LIVE TB paint; leave unconfigured path.
      status = 'READY_FOR_LIVE_TB';
      failedStage = 'none';
      // READY only with usable groups: override via panelDerived when saved===0
    } else {
      status = 'SUPERVISOR_VERIFICATION_REQUIRED';
      failedStage = 'physical_strip_detection';
    }

    const panelDerived = derivePanelLiveTbStatus({
      analysisStatus: status,
      scheduleDrawingMismatch,
      // READY only with usable current-checksum groups (or nothing expected on schedule).
      hasUsableTbGroups: saved > 0 || expectedCount === 0,
      needsSupervisorVerification: status === 'SUPERVISOR_VERIFICATION_REQUIRED',
      technicalFailure: status === 'TECHNICAL_FAILURE',
      failedStage,
    });
    if (
      status === 'READY_FOR_LIVE_TB'
      && saved === 0
      && expectedCount > 0
      && panelDerived.panel_status !== 'READY_FOR_LIVE_TB'
    ) {
      status = panelDerived.panel_status;
    }

    await setStatus(status, {
      result_summary: {
        engine: result.engine,
        notes: result.notes,
        expected: expectedCount,
        high: high.length,
        medium: reviewCandidates.filter(c => c.confidence === 'MEDIUM').length,
        ambiguous: reviewCandidates.filter(c => c.confidence === 'AMBIGUOUS').length,
        saved,
        page_types: result.page_types,
        headers_found: headersFound,
        headers_missing: headersMissing,
        headers_legend_only: legendOnly,
        headers_unresolved: unresolved,
        schedule_drawing_mismatch: scheduleDrawingMismatch,
        panel_status: panelDerived.panel_status,
        failed_stage:
          (result as any).grounding_unavailable && String(process.env.LOCATEANYTHING_REQUIRED || '') === '1'
            ? 'grounding_unavailable'
            : panelDerived.failed_stage,
        retry_count: retryCount,
        last_error: lastError,
        pipeline_stage: 'COMPLETE',
        pipeline_version: LIVE_TB_PIPELINE_VERSION,
        stages_run: (result as any).stages_run || [],
        locate_status: (result as any).locate_status || workerHealth.locate_status,
        grounding_unavailable: !!(result as any).grounding_unavailable,
        evidence_by_header: (result as any).evidence_by_header || {},
        analyse_once_cache_key: (result as any).analyse_once_cache_key || null,
        expected_tb_dictionary: expectedDictionary,
        readiness: {
          type: readiness.type,
          page_count: readiness.page_count,
          searchable: readiness.searchable,
          notes: readiness.notes,
          supervisor_verification_required: status === 'SUPERVISOR_VERIFICATION_REQUIRED',
        },
        worker_health: workerHealth,
        pending_candidates: reviewCandidates.map(c => ({
          tb_number: c.tb_number,
          terminal_group: c.terminal_group,
          page_number: c.page_number,
          geometry: c.geometry,
          confidence: c.confidence,
          confidence_score: c.confidence_score,
          detection_method: c.detection_method,
          reasons: c.reasons,
          view_name: c.view_name,
          evidence: (c as any).evidence || null,
        })),
        ...deviceMetrics,
      },
      failure_reason,
    });

    const classified = classifyLiveTbVerdict({
      scheduleDrawingMismatch,
      headersLegendOnly: legendOnly,
      headersUnresolved: unresolved,
      hasPaint: saved > 0,
      analysisFailed: status === 'TECHNICAL_FAILURE',
    });
    liveTbServerDebug({
      location: 'drawing-tb-analysis.service.ts:processInline',
      message: `TB analysis complete → ${status}`,
      project_code: input.projectCode,
      frame_id: input.frameId,
      verdict: classified.verdict,
      failed_stage: panelDerived.failed_stage,
      data: {
        saved,
        expected: expectedCount,
        high: high.length,
        panel_status: panelDerived.panel_status,
        headersFound,
        headersMissing,
        engine: result.engine,
        checksum: input.sha256,
      },
    });

    this.logger.log(
      `TB analysis ${input.projectCode}/${input.frameId} → ${status} (saved=${saved})`,
    );
  }

  /** Enqueue analysis after Excel/schedule replace (same path as GA upload). */
  async enqueueAfterScheduleUpload(input: {
    projectCode: string;
    frameId: string;
    requestedBy: number;
  }) {
    const pkg = FrameStore.getDrawingPackage(input.projectCode, input.frameId);
    const asset = pkg?.drawing_2d;
    if (!pkg || !asset?.id || !asset?.sha256) {
      this.logger.log(
        `schedule upload: no GA 2d for ${input.projectCode}/${input.frameId} — skip TB analysis`,
      );
      return { runId: null, jobId: null, skipped: true as const };
    }
    return this.enqueueAfterDrawingUpload({
      projectCode: input.projectCode,
      frameId: input.frameId,
      requestedBy: input.requestedBy,
      packageRevision: Number(pkg.revision || 1),
      sha256: String(asset.sha256),
      drawingAssetId: String(asset.id),
      previousSha256: asset.sha256,
    });
  }

  async getPanelStatus(projectCode: string, frameId: string) {
    const run = await this.getLatestStatus(projectCode, frameId);
    const summary = (run?.result_summary || {}) as Record<string, unknown>;
    const pkg = FrameStore.getDrawingPackage(projectCode, frameId);
    const checksum = pkg?.drawing_2d?.sha256 || run?.drawing_checksum || null;
    const groups = await this.autoMarkers.listActiveGroups(projectCode, frameId, checksum);
    const usable = groups.filter(g => {
      const notes = String((g as any).notes || '');
      if (notes.includes('DEV_BASELINE_FIXTURE') && process.env.DWES_LIVE_TB_BASELINE !== '1') {
        return false;
      }
      return true;
    });
    const derived = derivePanelLiveTbStatus({
      analysisStatus: run?.status,
      scheduleDrawingMismatch: summary.schedule_drawing_mismatch === true
        || run?.status === 'SCHEDULE_DRAWING_MISMATCH',
      hasUsableTbGroups: usable.length > 0,
      needsSupervisorVerification:
        run?.status === 'SUPERVISOR_VERIFICATION_REQUIRED'
        || (Array.isArray(summary.pending_candidates) && (summary.pending_candidates as unknown[]).length > 0),
      technicalFailure: run?.status === 'TECHNICAL_FAILURE',
      failedStage: (summary.failed_stage as LiveTbFailedStage) || null,
    });
    return {
      panel_status: derived.panel_status,
      failed_stage: derived.failed_stage,
      analysis_status: run?.status || 'UNCONFIGURED',
      drawing_checksum: checksum,
      usable_tb_groups: usable.length,
      pending_candidates: summary.pending_candidates || [],
      readiness: summary.readiness || null,
      worker_health: summary.worker_health || null,
      retry_count: summary.retry_count ?? 0,
      last_error: summary.last_error || null,
      failure_reason: run?.failure_reason || null,
      result_summary: summary,
      updated_at: run?.updated_at || null,
    };
  }

  async buildGates(projectCode: string, frameId: string) {
    const { buildNineGateReport } = await import('./panel-live-tb-status');
    const { probeWorkerHealth, classifyDrawingReadiness } = await import('./drawing-readiness');
    const fs = await import('fs');
    const path = await import('path');

    const frame =
      MockStore.findFrameByProjectAndId(projectCode, frameId) ||
      FrameStore.getFrameFromDisk(projectCode, frameId);
    const cables = (frame as any)?.cables || [];
    const expectedHeaders = buildExpectedTbHeaders(cables, (frame as any)?.mapping || null);
    const hasSchedulePhysicalTb = expectedHeaders.length > 0;

    const pkg = FrameStore.getDrawingPackage(projectCode, frameId);
    const asset = pkg?.drawing_2d;
    const checksum = asset?.sha256 || null;
    let drawingPath = '';
    if (asset?.id) {
      drawingPath = FrameStore.getDrawingFilePath(projectCode, asset.id) || '';
    }

    const run = await this.getLatestStatus(projectCode, frameId);
    const summary = (run?.result_summary || {}) as Record<string, unknown>;
    const health = await probeWorkerHealth();
    const readiness = classifyDrawingReadiness({
      drawingPath,
      pageTypes: Array.isArray(summary.page_types) ? (summary.page_types as string[]) : [],
    });

    const groups = await this.autoMarkers.listActiveGroups(projectCode, frameId, checksum);
    const crossVerifyPath = path.join(__dirname, 'excel-ga-cross-verify.js');
    const crossVerifyModulePresent = fs.existsSync(crossVerifyPath)
      || fs.existsSync(path.join(__dirname, 'excel-ga-cross-verify.ts'));

    const gates = buildNineGateReport({
      hasSchedulePhysicalTb,
      hasGa2d: !!asset?.id,
      checksum,
      readinessImplemented: true,
      readinessType: readiness.type,
      textExtractionOk: health.pdfjs === 'ok' && readiness.searchable,
      ocrAvailable: health.ocr_python === 'ok',
      physicalStripFound:
        Array.isArray(summary.headers_found) && (summary.headers_found as string[]).length > 0
          ? ((summary.high as number) || 0) > 0 || groups.length > 0
          : groups.length > 0,
      crossVerifyOk: summary.schedule_drawing_mismatch !== true && run?.status !== 'TECHNICAL_FAILURE',
      crossVerifyModulePresent,
      usableMarkers: groups.length,
      matchPathExists: true,
      overlayPathExists: true,
    });

    const panel = await this.getPanelStatus(projectCode, frameId);
    return {
      project_code: projectCode,
      frame_id: frameId,
      panel_status: panel.panel_status,
      failed_stage: panel.failed_stage,
      gates,
      worker_health: health,
      readiness,
      evidence: {
        expected_headers: expectedHeaders.slice(0, 40),
        analysis_status: run?.status || null,
        checksum,
        usable_markers: groups.length,
        headers_found: summary.headers_found || [],
        headers_missing: summary.headers_missing || [],
        headers_legend_only: summary.headers_legend_only || [],
      },
    };
  }

  async confirmPendingCandidate(input: {
    projectCode: string;
    frameId: string;
    userId: number;
    tbNumber: string;
    pageNumber: number;
    geometry: { x: number; y: number; width: number; height: number; rotation?: number };
    terminalGroup?: string;
    action: 'confirm' | 'correct' | 'reject' | 'not_in_ga';
  }) {
    const run = await this.getLatestStatus(input.projectCode, input.frameId);
    const summary = { ...((run?.result_summary || {}) as Record<string, any>) };
    const pending: any[] = Array.isArray(summary.pending_candidates)
      ? [...summary.pending_candidates]
      : [];
    const pkg = FrameStore.getDrawingPackage(input.projectCode, input.frameId);
    const checksum = String(pkg?.drawing_2d?.sha256 || run?.drawing_checksum || '');
    const tb = normalizeHeader(input.tbNumber);

    if (input.action === 'reject' || input.action === 'not_in_ga') {
      summary.pending_candidates = pending.filter(p => normalizeHeader(p.tb_number) !== tb);
      if (run?.id) {
        await this.prisma.drawing_tb_analysis_runs.update({
          where: { id: run.id },
          data: {
            result_summary: summary as any,
            status:
              summary.pending_candidates.length === 0 && (await this.autoMarkers.listActiveGroups(input.projectCode, input.frameId, checksum)).length === 0
                ? 'SCHEDULE_DRAWING_MISMATCH'
                : run.status,
            updated_at: new Date(),
            failure_reason:
              input.action === 'not_in_ga'
                ? `Supervisor marked ${tb} not present in GA`
                : run.failure_reason,
          },
        });
      }
      return { ok: true, action: input.action, tb_number: tb };
    }

    await this.prisma.tb_markers.create({
      data: {
        project_code: input.projectCode,
        frame_id: input.frameId,
        page_number: input.pageNumber || 1,
        marker_type: 'TB_GROUP',
        tb_number: tb,
        terminal_group: input.terminalGroup || '1-99',
        geometry: {
          x: input.geometry.x,
          y: input.geometry.y,
          width: input.geometry.width,
          height: input.geometry.height,
          rotation: input.geometry.rotation || 0,
        } as any,
        notes: `SUPERVISOR_${input.action.toUpperCase()}`,
        drawing_revision: String(pkg?.revision || run?.drawing_revision || '1'),
        drawing_checksum: checksum,
        detection_method: 'SUPERVISOR_VERIFIED',
        confidence_score: 1,
        created_automatically: false,
        marker_status: 'ACTIVE',
        analysis_run_id: run?.id || null,
        created_by: input.userId,
        updated_at: new Date(),
      } as any,
    });

    summary.pending_candidates = pending.filter(p => normalizeHeader(p.tb_number) !== tb);
    const groups = await this.autoMarkers.listActiveGroups(input.projectCode, input.frameId, checksum);
    if (run?.id) {
      await this.prisma.drawing_tb_analysis_runs.update({
        where: { id: run.id },
        data: {
          result_summary: {
            ...summary,
            panel_status: groups.length > 0 ? 'READY_FOR_LIVE_TB' : 'SUPERVISOR_VERIFICATION_REQUIRED',
          } as any,
          status: groups.length > 0 ? 'READY_FOR_LIVE_TB' : 'SUPERVISOR_VERIFICATION_REQUIRED',
          updated_at: new Date(),
          failure_reason: null,
        },
      });
    }
    return { ok: true, action: input.action, tb_number: tb, usable_groups: groups.length };
  }

  async exportDebugNdjson(projectCode: string, frameId: string): Promise<string> {
    const gates = await this.buildGates(projectCode, frameId);
    const panel = await this.getPanelStatus(projectCode, frameId);
    const run = await this.getLatestStatus(projectCode, frameId);
    const lines = [
      JSON.stringify({ type: 'panel_status', ...panel, ts: Date.now() }),
      JSON.stringify({ type: 'gates', ...gates, ts: Date.now() }),
      JSON.stringify({
        type: 'analysis_run',
        id: run?.id,
        status: run?.status,
        failure_reason: run?.failure_reason,
        result_summary: run?.result_summary,
        ts: Date.now(),
      }),
    ];
    return lines.join('\n') + '\n';
  }
}

function normalizeHeader(value: string): string {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}
