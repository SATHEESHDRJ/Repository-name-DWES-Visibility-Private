import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class DashboardCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardCacheService.name);
  private readonly memoryCache = new Map<string, CacheEntry<any>>();
  private redisClient: Redis | null = null;
  private isRedisActive = false;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (redisUrl && process.env.DWES_ENABLE_REDIS_CACHE !== 'false') {
      try {
        this.redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
        // ioredis reconnects on its own (default retryStrategy); these listeners just
        // keep isRedisActive truthful across the outage so callers fall back correctly
        // and health/ready can report a live connection instead of a startup snapshot.
        this.redisClient.on('ready', () => {
          if (!this.isRedisActive) this.logger.log('Redis Dashboard Cache reconnected');
          this.isRedisActive = true;
        });
        this.redisClient.on('error', (err: Error) => {
          if (this.isRedisActive) {
            this.isRedisActive = false;
            this.logger.warn(`Redis Cache connection error: ${err.message}. Falling back to in-memory TTL caching.`);
          }
        });
        await this.redisClient.connect();
        this.isRedisActive = true;
        this.logger.log('Redis Dashboard Cache connected');
      } catch (err: any) {
        this.logger.warn(`Redis Cache initialization failed: ${err.message}. Falling back to in-memory TTL caching.`);
        this.isRedisActive = false;
      }
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  /** Surfaced by /health/ready — lets readiness distinguish "no Redis configured" from "Redis configured but down". */
  getStatus(): { redisConfigured: boolean; redisActive: boolean } {
    return {
      redisConfigured: Boolean(process.env.REDIS_URL?.trim()) && process.env.DWES_ENABLE_REDIS_CACHE !== 'false',
      redisActive: this.isRedisActive,
    };
  }

  get<T>(key: string): T | undefined {
    const entry = this.memoryCache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async getAsync<T>(key: string): Promise<T | undefined> {
    const mem = this.get<T>(key);
    if (mem !== undefined) return mem;
    if (this.isRedisActive && this.redisClient) {
      try {
        const payload = await this.redisClient.get(`dwes:cache:${key}`);
        if (payload) return JSON.parse(payload) as T;
      } catch {
        /* ignore */
      }
    }
    return undefined;
  }

  async acquireLock(key: string, ttlMs = 10000): Promise<string | false> {
    const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (this.isRedisActive && this.redisClient) {
      try {
        const result = await this.redisClient.set(`dwes:lock:${key}`, owner, 'PX', ttlMs, 'NX');
        return result === 'OK' ? owner : false;
      } catch {
        // A single command failed (timeout, mid-outage) even though the connection
        // looked active. Degrade to the local lock rather than reporting "held by
        // someone else" for a lock nobody actually holds.
      }
    }
    const existing = this.memoryCache.get(`lock:${key}`);
    if (existing && Date.now() < existing.expiresAt) return false;
    this.memoryCache.set(`lock:${key}`, { value: owner, expiresAt: Date.now() + ttlMs });
    return owner;
  }

  async releaseLock(key: string, owner: string): Promise<void> {
    if (this.isRedisActive && this.redisClient) {
      try {
        // Atomic compare-and-delete: only the lock owner can release
        await this.redisClient.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          `dwes:lock:${key}`,
          owner,
        );
      } catch { /* ignore — fall through and also clear any local fallback lock below */ }
    }
    // Always attempt the local release too: if acquireLock degraded to the in-memory
    // path (Redis errored at acquire time), only this clears it — a no-op otherwise.
    const existing = this.memoryCache.get(`lock:${key}`);
    if (existing && existing.value === owner) {
      this.memoryCache.delete(`lock:${key}`);
    }
  }

  set<T>(key: string, value: T, ttlMs = 30_000): void {
    // 1. In-memory TTL cache
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });

    // 2. Redis Cache
    if (this.isRedisActive && this.redisClient) {
      try {
        const payload = JSON.stringify(value);
        const ttlSec = Math.ceil(ttlMs / 1000);
        void this.redisClient.setex(`dwes:cache:${key}`, ttlSec, payload).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.memoryCache.clear();
      return;
    }
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
  }

  invalidateSummaryCaches(): void {
    this.memoryCache.clear();
    if (this.isRedisActive && this.redisClient) {
      try {
        void this.redisClient.eval(
          "for _, k in ipairs(redis.call('keys', 'dwes:cache:*')) do redis.call('del', k) end",
          0,
        ).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
  }
}
