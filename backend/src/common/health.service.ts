import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { JobsService } from '../jobs/jobs.service';
import { DashboardCacheService } from './cache/dashboard-cache.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventsService?: EventsService,
    @Optional() private readonly jobsService?: JobsService,
    @Optional() private readonly cacheService?: DashboardCacheService,
  ) {}

  async checkLive() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      pid: process.pid,
      timestamp: new Date().toISOString(),
    };
  }

  async checkReady() {
    let dbStatus = 'ok';
    let dbError: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = 'unreachable';
      dbError = err.message;
    }

    // Check storage mount accessibility
    const uploadDir = process.env.DWES_UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
    let storageStatus = 'ok';
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (err: any) {
      storageStatus = 'degraded';
    }

    const memoryUsage = process.memoryUsage();
    const eventStatus = this.eventsService?.getFanoutStatus() ?? { mode: 'local', redisReady: false, pgReady: false };
    const queueStatus = this.jobsService?.getStatus() ?? { redisConfigured: false, bullmqActive: false };
    const cacheStatus = this.cacheService?.getStatus() ?? { redisConfigured: false, redisActive: false };

    // "degraded": PostgreSQL is reachable and the app can serve traffic, but a Redis
    // subsystem that was explicitly configured (REDIS_URL set) is currently running on
    // its non-Redis fallback — SSE falls back to PG LISTEN/NOTIFY or local-only, BullMQ
    // jobs execute inline, and the dashboard cache is local-memory-only (no cross-instance
    // sharing). None of this makes the instance unready; it just means the operator asked
    // for Redis and isn't getting it right now.
    const redisConfigured = queueStatus.redisConfigured || cacheStatus.redisConfigured
      || eventStatus.mode !== 'local' || Boolean(process.env.REDIS_URL?.trim());
    const redisFullyUp = eventStatus.redisReady && queueStatus.bullmqActive && cacheStatus.redisActive;
    const degraded = redisConfigured && !redisFullyUp;

    const isReady = dbStatus === 'ok';
    const payload = {
      // Preserved exactly as before: existing consumers keyed off this field only ever
      // saw 'ok' or 'degraded'. The new `ready` / `degraded` booleans below are additive
      // and carry the finer live/ready/degraded distinction this endpoint now reports.
      status: isReady ? 'ok' : 'degraded',
      ready: isReady,
      degraded,
      db: dbStatus,
      db_error: dbError,
      storage: storageStatus,
      sse_events: eventStatus,
      queue: queueStatus,
      cache: cacheStatus,
      memory: {
        rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    if (!isReady) {
      throw new ServiceUnavailableException(payload);
    }
    return payload;
  }

  async check() {
    return this.checkReady();
  }
}
