import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** A pluggable job handler, registered by a feature module (e.g. upload, reports). */
export type JobHandler = (payload: any, report: (pct: number) => Promise<void>) => Promise<any>;

export interface BackgroundJobDto {
  id: string;
  job_type: string;
  project_code: string;
  frame_id: string;
  requested_by: number;
  status: JobStatus;
  progress: number;
  payload: any;
  result?: any;
  attempts: number;
  max_attempts: number;
  safe_error?: string | null;
  created_at: Date;
  started_at?: Date | null;
  finished_at?: Date | null;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private redisConnection: Redis | null = null;
  private isBullMqActive = false;
  private inMemoryJobs = new Map<string, BackgroundJobDto>();
  private readonly handlers = new Map<string, JobHandler>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (redisUrl && process.env.DWES_ENABLE_BULLMQ !== 'false') {
      try {
        this.redisConnection = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });

        this.queue = new Queue('dwes_jobs', { connection: this.redisConnection });
        this.worker = new Worker('dwes_jobs', async job => this.executeJobHandler(job.data), {
          connection: this.redisConnection,
        });

        this.worker.on('completed', job => {
          this.logger.log(`BullMQ job ${job.id} (${job.name}) completed`);
        });
        this.worker.on('failed', (job, err) => {
          this.logger.error(`BullMQ job ${job?.id} failed: ${err.message}`);
        });
        this.worker.on('stalled', jobId => {
          this.logger.warn(`BullMQ job ${jobId} stalled — BullMQ is recovering it to another worker slot`);
        });

        // The shared connection auto-reconnects (ioredis default retryStrategy); track
        // its live state so createJob() can stop routing to a queue it can't reach
        // instead of blocking the HTTP request on a hung `queue.add()`.
        this.redisConnection.on('ready', () => {
          if (!this.isBullMqActive) this.logger.log('BullMQ Redis connection restored');
          this.isBullMqActive = true;
        });
        this.redisConnection.on('error', (err: Error) => {
          if (this.isBullMqActive) {
            this.isBullMqActive = false;
            this.logger.warn(`BullMQ Redis connection error: ${err.message}. Falling back to in-memory worker mode.`);
          }
        });

        this.isBullMqActive = true;
        this.logger.log('BullMQ background processing active with Redis worker');
      } catch (err: any) {
        this.logger.warn(`BullMQ initialization failed: ${err.message}. Falling back to background async worker mode.`);
        this.isBullMqActive = false;
      }
    } else {
      this.logger.log('BullMQ disabled or REDIS_URL not present. Running background jobs with in-memory worker fallback.');
    }
  }

  async onModuleDestroy() {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    if (this.redisConnection) this.redisConnection.disconnect();
  }

  /**
   * Lets a feature module (upload, reports, ...) supply the real logic for a job
   * type without JobsService depending on that module — mirrors the same pattern
   * `backend/src/ga-foundation/job-queue.service.ts` already uses for its jobs.
   * Call once per jobType, typically from the owning module's onModuleInit.
   */
  registerHandler(jobType: string, handler: JobHandler): void {
    if (!jobType.trim()) throw new Error('Job type is required');
    if (this.handlers.has(jobType)) throw new Error(`A handler is already registered for ${jobType}`);
    this.handlers.set(jobType, handler);
  }

  /** Surfaced by /health/ready — lets readiness distinguish "no Redis configured" from "Redis configured but down". */
  getStatus(): { redisConfigured: boolean; bullmqActive: boolean } {
    return {
      redisConfigured: Boolean(process.env.REDIS_URL?.trim()) && process.env.DWES_ENABLE_BULLMQ !== 'false',
      bullmqActive: this.isBullMqActive,
    };
  }

  async createJob(opts: {
    jobType: string;
    projectCode: string;
    frameId: string;
    requestedBy: number;
    payload: any;
    maxAttempts?: number;
  }): Promise<BackgroundJobDto> {
    const id = randomUUID();
    const maxAttempts = opts.maxAttempts ?? 2;

    const jobDto: BackgroundJobDto = {
      id,
      job_type: opts.jobType,
      project_code: opts.projectCode,
      frame_id: opts.frameId,
      requested_by: opts.requestedBy,
      status: 'QUEUED',
      progress: 0,
      payload: opts.payload,
      attempts: 0,
      max_attempts: maxAttempts,
      created_at: new Date(),
    };

    try {
      await this.prisma.background_jobs.create({
        data: {
          id,
          job_type: opts.jobType,
          project_code: opts.projectCode,
          frame_id: opts.frameId,
          requested_by: opts.requestedBy,
          status: 'QUEUED',
          payload: opts.payload,
          max_attempts: maxAttempts,
        },
      });
    } catch {
      this.inMemoryJobs.set(id, jobDto);
    }

    await this.enqueueOrRunLocally(opts.jobType, { jobId: id, ...opts }, id, maxAttempts);

    return jobDto;
  }

  /**
   * isBullMqActive is kept live by the connection's 'ready'/'error' listeners (see
   * onModuleInit), so a Redis outage is reflected here within one event-loop tick —
   * no need to race `queue.add()` against a timeout. Racing it would risk a worse bug:
   * ioredis buffers commands issued while disconnected (enableOfflineQueue, on by
   * default) and replays them on reconnect, which would run the job a second time
   * on top of the local fallback this method would otherwise take.
   */
  private async enqueueOrRunLocally(jobType: string, data: any, jobId: string, maxAttempts: number): Promise<void> {
    if (this.isBullMqActive && this.queue) {
      try {
        await this.queue.add(jobType, data, {
          jobId,
          attempts: maxAttempts,
          backoff: { type: 'exponential', delay: 5_000 },
        });
        return;
      } catch (err: any) {
        this.logger.warn(`BullMQ enqueue failed (${err.message}); running job ${jobId} inline instead.`);
      }
    }
    // Execute in background fallback mode. executeJobHandler already records failure
    // (status + safe_error) via updateJobProgress before rethrowing — the rethrow exists
    // so BullMQ's Worker can see it for retry/failed-count tracking, but nothing awaits
    // this fire-and-forget call, so left uncaught it becomes an unhandled rejection.
    setImmediate(() => {
      void this.executeJobHandler(data).catch((err: any) => {
        this.logger.error(`Job ${jobId} (${jobType}) failed: ${err?.message ?? err}`);
      });
    });
  }

  async updateJobProgress(jobId: string, progress: number, status?: JobStatus, result?: any, error?: string): Promise<void> {
    // `progress` has no column on background_jobs (getJob derives it from `status`
    // instead — see below) — including it in the Prisma `data` payload throws an
    // "unknown argument" validation error on every call, which the catch below used
    // to swallow silently. That left every job frozen at QUEUED in the database
    // forever, even after it had actually run to completion (only the in-memory
    // fallback, when populated, ever reflected the true status).
    const data: any = {};
    if (status) data.status = status;
    if (result !== undefined) data.result = result;
    if (error !== undefined) data.safe_error = error;
    if (status === 'PROCESSING' && !data.started_at) data.started_at = new Date();
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') data.finished_at = new Date();

    try {
      if (Object.keys(data).length > 0) {
        await this.prisma.background_jobs.update({
          where: { id: jobId },
          data,
        });
      }
    } catch (err: any) {
      this.logger.warn(`background_jobs update failed for ${jobId} (${err.message}); using in-memory fallback`);
      const existing = this.inMemoryJobs.get(jobId);
      if (existing) {
        this.inMemoryJobs.set(jobId, { ...existing, ...data, progress });
      }
    }
  }

  private async executeJobHandler(jobData: any): Promise<any> {
    const { jobId, jobType, payload } = jobData;
    await this.updateJobProgress(jobId, 10, 'PROCESSING');
    try {
      let result: any;
      const handler = this.handlers.get(jobType);

      if (handler) {
        result = await handler(payload, pct => this.updateJobProgress(jobId, pct));
      } else if (jobType === 'backup_export') {
        result = await this.runBackupExportJob(jobId, payload);
      } else if (jobType === 'dwg_convert') {
        // DWG/DXF conversion is a real, configured operation elsewhere in the app
        // (backend/src/ga-foundation's CadProviderRegistry / LocalLibreDwgProvider,
        // and backend/src/upload/drawing-preview-converter.ts for browser previews).
        // This generic queue has no caller and no converter wired to it — never
        // fabricate a "converted" result; fail with the same clear-configuration-error
        // pattern those real converters use.
        throw new Error(
          'DWG conversion is not configured for the generic job queue. Use the GA foundation ' +
          'CAD conversion pipeline (DWES_LIBREDWG_BIN_DIR) or the drawing preview converter ' +
          '(DWES_CAD_PREVIEW_EXECUTABLE); no fallback conversion is performed.',
        );
      } else {
        // Unknown/unsupported job type: fail clearly rather than silently marking a
        // job COMPLETED with a fabricated empty result.
        throw new Error(`Unsupported job type: ${jobType}`);
      }

      await this.updateJobProgress(jobId, 100, 'COMPLETED', result);
      return result;
    } catch (err: any) {
      await this.updateJobProgress(jobId, 0, 'FAILED', null, err.message);
      throw err;
    }
  }

  async getJob(jobId: string): Promise<BackgroundJobDto | null> {
    try {
      const record = await this.prisma.background_jobs.findUnique({ where: { id: jobId } });
      if (record) {
        return {
          id: record.id,
          job_type: record.job_type,
          project_code: record.project_code,
          frame_id: record.frame_id,
          requested_by: record.requested_by,
          status: (record.status.toUpperCase() as JobStatus) || 'QUEUED',
          progress: record.status === 'COMPLETED' || record.status === 'completed' ? 100 : record.status === 'PROCESSING' || record.status === 'processing' ? 50 : 0,
          payload: record.payload,
          result: record.result,
          attempts: record.attempts,
          max_attempts: record.max_attempts,
          safe_error: record.safe_error,
          created_at: record.created_at,
          started_at: record.started_at,
          finished_at: record.finished_at,
        };
      }
    } catch {
      /* fallback to memory */
    }
    return this.inMemoryJobs.get(jobId) ?? null;
  }

  async listJobs(opts?: { projectCode?: string; frameId?: string; limit?: number }): Promise<BackgroundJobDto[]> {
    const limit = opts?.limit ?? 50;
    try {
      const where: any = {};
      if (opts?.projectCode) where.project_code = opts.projectCode;
      if (opts?.frameId) where.frame_id = opts.frameId;

      const records = await this.prisma.background_jobs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
      });

      return records.map(record => ({
        id: record.id,
        job_type: record.job_type,
        project_code: record.project_code,
        frame_id: record.frame_id,
        requested_by: record.requested_by,
        status: (record.status.toUpperCase() as JobStatus) || 'QUEUED',
        progress: record.status === 'COMPLETED' || record.status === 'completed' ? 100 : record.status === 'PROCESSING' || record.status === 'processing' ? 50 : 0,
        payload: record.payload,
        result: record.result,
        attempts: record.attempts,
        max_attempts: record.max_attempts,
        safe_error: record.safe_error,
        created_at: record.created_at,
        started_at: record.started_at,
        finished_at: record.finished_at,
      }));
    } catch {
      return [...this.inMemoryJobs.values()].slice(0, limit);
    }
  }

  async retryJob(jobId: string): Promise<BackgroundJobDto | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;
    await this.updateJobProgress(jobId, 0, 'QUEUED', null, null);
    await this.enqueueOrRunLocally(
      job.job_type,
      { jobId, jobType: job.job_type, payload: job.payload, projectCode: job.project_code, frameId: job.frame_id },
      jobId,
      job.max_attempts,
    );
    return this.getJob(jobId);
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return false;
    await this.updateJobProgress(jobId, job.progress, 'CANCELLED');
    return true;
  }

  private resolveProjectRoot(): string {
    if (process.env.DWES_PROJECT_ROOT?.trim()) {
      return path.resolve(process.env.DWES_PROJECT_ROOT.trim());
    }
    return path.resolve(__dirname, '..', '..', '..');
  }

  private readBackupRoot(projectRoot: string): string {
    const configPath = path.join(projectRoot, 'scripts', 'backup.config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw) as { backupRoot?: string };
    const fromEnv = process.env.DWES_BACKUP_ROOT?.trim();
    if (fromEnv) return path.resolve(fromEnv);
    if (config.backupRoot) return path.resolve(config.backupRoot);
    return path.join(projectRoot, 'Backup');
  }

  private readLatestBackupReport(backupRoot: string): Record<string, unknown> | null {
    if (!fs.existsSync(backupRoot)) return null;
    const dirs = fs
      .readdirSync(backupRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'logs')
      .map(d => {
        const full = path.join(backupRoot, d.name);
        return { name: d.name, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const dir of dirs) {
      const reportPath = path.join(backupRoot, dir.name, 'backup-report.json');
      if (!fs.existsSync(reportPath)) continue;
      try {
        return JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    return null;
  }

  /** Runs scripts/backup.ps1 (same pipeline as npm run backup). */
  private async runBackupExportJob(jobId: string, payload: unknown): Promise<Record<string, unknown>> {
    if (process.platform !== 'win32') {
      throw new Error('Full project backup requires Windows (scripts/backup.ps1).');
    }

    const opts = (payload && typeof payload === 'object' ? payload : {}) as {
      dryRun?: boolean;
      preOperation?: boolean;
    };
    const dryRun = opts.dryRun === true;
    const preOperation = opts.preOperation === true;

    const projectRoot = this.resolveProjectRoot();
    const ps1 = path.join(projectRoot, 'scripts', 'backup.ps1');
    if (!fs.existsSync(ps1)) {
      throw new Error(`Backup script not found: ${ps1}`);
    }

    await this.updateJobProgress(jobId, 20);

    const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1];
    if (dryRun) psArgs.push('-DryRun');
    if (preOperation) psArgs.push('-PreOperation');

    this.logger.log(
      `backup_export ${jobId}: starting backup.ps1 (dryRun=${dryRun}, preOperation=${preOperation})`,
    );

    // spawn (not spawnSync): this handler runs inline in the same Node process as the
    // HTTP server and the BullMQ worker's lock-renewal heartbeat. A synchronous child
    // process call here would freeze the entire event loop — HTTP requests, SSE
    // heartbeats, DB health checks, and BullMQ's own lock renewal — for up to 10
    // minutes, which would also make BullMQ think this job (and worker) had stalled.
    const result = await this.runBackupScript('powershell.exe', psArgs, {
      cwd: projectRoot,
      env: {
        ...process.env,
        DWES_PROJECT_ROOT: projectRoot,
        DWES_BACKUP_TRIGGER: 'background-job',
      },
      timeoutMs: 600_000,
    });

    await this.updateJobProgress(jobId, 90);

    const exitCode = result.status ?? 1;
    if (exitCode !== 0 && exitCode !== 2) {
      const detail =
        result.stderr?.trim() ||
        result.stdout?.trim() ||
        result.error?.message ||
        `backup.ps1 exit ${exitCode}`;
      throw new Error(detail.slice(0, 500));
    }

    const backupRoot = this.readBackupRoot(projectRoot);
    const report = this.readLatestBackupReport(backupRoot);

    return {
      success: true,
      exit_code: exitCode,
      warnings: exitCode === 2,
      trigger: 'background-job',
      dry_run: dryRun,
      pre_operation: preOperation,
      backup_destination: report?.backupDestination ?? report?.backup_destination ?? null,
      backup_name: report?.backupName ?? report?.backup_name ?? null,
      duration_seconds: report?.durationSeconds ?? report?.duration_seconds ?? null,
      files_total_size_mb:
        (report?.files as Record<string, unknown> | undefined)?.totalSizeMb ?? null,
      database_success:
        (report?.database as Record<string, unknown> | undefined)?.success ?? null,
      report: report ?? undefined,
    };
  }

  /** Non-blocking equivalent of spawnSync — never freezes the process event loop. */
  private runBackupScript(
    command: string,
    args: string[],
    opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
  ): Promise<{ status: number | null; stdout: string; stderr: string; error?: Error }> {
    return new Promise(resolve => {
      const child = spawn(command, args, {
        cwd: opts.cwd,
        env: opts.env,
        windowsHide: true,
        timeout: opts.timeoutMs,
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', chunk => { stdout += chunk; });
      child.stderr?.on('data', chunk => { stderr += chunk; });

      child.on('error', err => {
        resolve({ status: null, stdout, stderr, error: err });
      });
      child.on('close', status => {
        resolve({ status, stdout, stderr });
      });
    });
  }
}
