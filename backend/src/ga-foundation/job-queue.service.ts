import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, type background_jobs } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { loadWiringDbTables, wiringTableReady } from '../common/wiring-db-tables';
import type {
  BackgroundJobContext,
  BackgroundJobHandler,
  BackgroundJobStatus,
} from './ga-foundation.types';

const TERMINAL_JOB_STATES: BackgroundJobStatus[] = ['completed', 'failed', 'cancelled'];

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Background job failed';
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

@Injectable()
export class JobQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly handlers = new Map<string, BackgroundJobHandler>();
  private readonly workerId = `${process.pid}-${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private activeWorkers = 0;
  private stopping = false;
  private jobQueueEnabled = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    void loadWiringDbTables(this.prisma).then(tables => {
      this.jobQueueEnabled = wiringTableReady(tables, 'background_jobs');
      if (!this.jobQueueEnabled) {
        this.logger.warn('background_jobs table absent — engineering job queue polling disabled');
        return;
      }
      const interval = this.boundedNumber(process.env.DWES_JOB_POLL_MS, 1_000, 250, 30_000);
      this.timer = setInterval(() => void this.tick(), interval);
      this.timer.unref();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  registerHandler(jobType: string, handler: BackgroundJobHandler): void {
    if (!jobType.trim()) throw new Error('Job type is required');
    if (this.handlers.has(jobType)) throw new Error(`A handler is already registered for ${jobType}`);
    this.handlers.set(jobType, handler);
  }

  async enqueue(input: {
    jobType: string;
    projectCode: string;
    frameId: string;
    requestedBy: number;
    payload: Record<string, unknown>;
    maxAttempts?: number;
  }) {
    if (!this.jobQueueEnabled) {
      throw new ConflictException('Background job queue is unavailable on this database');
    }
    if (!this.handlers.has(input.jobType)) throw new ConflictException(`Background job type ${input.jobType} is unavailable`);
    const maxAttempts = this.boundedNumber(String(input.maxAttempts ?? 2), 2, 1, 5);
    const job = await this.prisma.background_jobs.create({
      data: {
        job_type: input.jobType,
        project_code: input.projectCode,
        frame_id: input.frameId,
        requested_by: input.requestedBy,
        payload: input.payload as Prisma.InputJsonValue,
        max_attempts: maxAttempts,
      },
    });
    this.events.publish({
      scope: 'engineering',
      action: 'created',
      projectCode: input.projectCode,
      frameId: input.frameId,
      actorId: input.requestedBy,
    });
    void this.tick();
    return this.publicJob(job);
  }

  async getOwned(jobId: string, user: { id: number; role: string }) {
    const job = await this.prisma.background_jobs.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Background job not found');
    if (!['prod_supervisor', 'system_admin', 'ops_director', 'qaqc_engineer'].includes(user.role)) {
      throw new ForbiddenException('This role cannot view engineering jobs');
    }
    if (user.role === 'prod_supervisor' && job.requested_by !== user.id) {
      // Supervisors may still view panel-owned jobs through the panel workflow;
      // ownership is enforced by the exact project/panel route in the controller.
      return this.publicJob(job);
    }
    return this.publicJob(job);
  }

  async cancel(jobId: string, user: { id: number; role: string }) {
    const job = await this.prisma.background_jobs.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Background job not found');
    if (job.requested_by !== user.id && user.role !== 'system_admin') {
      throw new ForbiddenException('Only the requester or System Administrator can cancel this job');
    }
    if (TERMINAL_JOB_STATES.includes(job.status as BackgroundJobStatus)) return this.publicJob(job);
    const updated = await this.prisma.background_jobs.update({
      where: { id: jobId },
      data: job.status === 'queued'
        ? { status: 'cancelled', cancel_requested_at: new Date(), finished_at: new Date() }
        : { cancel_requested_at: new Date() },
    });
    return this.publicJob(updated);
  }

  /** Exposed for deterministic tests and administrative recovery. */
  async processAvailableOnce(): Promise<boolean> {
    const job = await this.claimNext();
    if (!job) return false;
    await this.process(job);
    return true;
  }

  private async tick(): Promise<void> {
    if (this.stopping || !this.jobQueueEnabled) return;
    const concurrency = this.boundedNumber(process.env.DWES_JOB_CONCURRENCY, 1, 1, 8);
    while (this.activeWorkers < concurrency) {
      const job = await this.claimNext().catch(error => {
        this.logger.warn(`Job claim failed: ${safeError(error)}`);
        return null;
      });
      if (!job) return;
      this.activeWorkers += 1;
      void this.process(job).finally(() => {
        this.activeWorkers -= 1;
        if (!this.stopping) void this.tick();
      });
    }
  }

  private async claimNext(): Promise<background_jobs | null> {
    const now = new Date();
    // Recover work abandoned by a terminated replica after its bounded lease.
    await this.prisma.background_jobs.updateMany({
      where: {
        status: 'processing',
        lease_expires_at: { lte: now },
        cancel_requested_at: null,
      },
      data: {
        status: 'queued',
        available_at: now,
        lease_owner: null,
        lease_expires_at: null,
      },
    });
    await this.prisma.background_jobs.updateMany({
      where: {
        status: 'processing',
        lease_expires_at: { lte: now },
        cancel_requested_at: { not: null },
      },
      data: {
        status: 'cancelled',
        finished_at: now,
        lease_owner: null,
        lease_expires_at: null,
      },
    });
    const candidate = await this.prisma.background_jobs.findFirst({
      where: {
        status: 'queued',
        available_at: { lte: now },
        cancel_requested_at: null,
        attempts: { lt: 5 },
      },
      orderBy: { created_at: 'asc' },
    });
    if (!candidate || candidate.attempts >= candidate.max_attempts) return null;
    const leaseMs = this.boundedNumber(process.env.DWES_JOB_LEASE_MS, 120_000, 10_000, 30 * 60_000);
    const claimed = await this.prisma.background_jobs.updateMany({
      where: { id: candidate.id, status: 'queued', attempts: candidate.attempts },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
        started_at: candidate.started_at ?? now,
        lease_owner: this.workerId,
        lease_expires_at: new Date(now.getTime() + leaseMs),
      },
    });
    if (claimed.count !== 1) return null;
    return this.prisma.background_jobs.findUnique({ where: { id: candidate.id } });
  }

  private async process(job: background_jobs): Promise<void> {
    const handler = this.handlers.get(job.job_type);
    if (!handler) {
      await this.fail(job, new Error(`No handler registered for ${job.job_type}`));
      return;
    }
    try {
      const latest = await this.prisma.background_jobs.findUnique({ where: { id: job.id } });
      if (!latest || latest.cancel_requested_at) {
        await this.prisma.background_jobs.update({
          where: { id: job.id },
          data: { status: 'cancelled', finished_at: new Date(), lease_owner: null, lease_expires_at: null },
        });
        return;
      }
      const context: BackgroundJobContext = {
        id: job.id,
        jobType: job.job_type,
        projectCode: job.project_code,
        frameId: job.frame_id,
        requestedBy: job.requested_by,
        payload: jsonObject(job.payload),
        attempt: job.attempts,
      };
      const outcome = await handler(context);
      await this.prisma.background_jobs.update({
        where: { id: job.id },
        data: {
          status: outcome.status,
          result: outcome.result as Prisma.InputJsonValue,
          provider_name: outcome.providerName,
          provider_version: outcome.providerVersion,
          finished_at: outcome.status === 'completed' ? new Date() : null,
          safe_error: null,
          lease_owner: null,
          lease_expires_at: null,
        },
      });
      this.events.publish({
        scope: 'engineering', action: 'updated', projectCode: job.project_code,
        frameId: job.frame_id, actorId: job.requested_by,
      });
    } catch (error) {
      await this.fail(job, error);
    }
  }

  private async fail(job: background_jobs, error: unknown): Promise<void> {
    const retry = job.attempts < job.max_attempts;
    await this.prisma.background_jobs.update({
      where: { id: job.id },
      data: retry
        ? {
            status: 'queued',
            available_at: new Date(Date.now() + Math.min(30_000, 2_000 * job.attempts)),
            safe_error: safeError(error),
            lease_owner: null,
            lease_expires_at: null,
          }
        : {
            status: 'failed',
            safe_error: safeError(error),
            finished_at: new Date(),
            lease_owner: null,
            lease_expires_at: null,
          },
    });
    this.events.publish({
      scope: 'engineering', action: 'updated', projectCode: job.project_code,
      frameId: job.frame_id, actorId: job.requested_by,
    });
  }

  private publicJob(job: background_jobs) {
    return {
      id: job.id,
      job_type: job.job_type,
      project_code: job.project_code,
      frame_id: job.frame_id,
      status: job.status,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      result: job.result,
      provider_name: job.provider_name,
      provider_version: job.provider_version,
      error: job.safe_error,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
    };
  }

  private boundedNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
  }
}
