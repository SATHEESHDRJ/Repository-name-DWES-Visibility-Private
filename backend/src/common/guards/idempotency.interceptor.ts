import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional, ConflictException,
} from '@nestjs/common';
import { Observable, of, from } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { createHash } from 'crypto';
import { DashboardCacheService } from '../cache/dashboard-cache.service';

/**
 * Bounded so a stuck/crashed holder cannot block a key forever, but generous enough
 * to outlast the slowest idempotency target (confirm-upload parses a full Excel sheet).
 */
const LOCK_TTL_MS = 30_000;
/** Slightly longer than the lock TTL: a legitimate in-flight request finishing right
 * at the TTL boundary must still be observed before a waiter gives up and takes over. */
const WAIT_TIMEOUT_MS = 32_000;
const POLL_INTERVAL_MS = 150;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private inMemoryCache = new Map<string, { status: number; body: any }>();
  private processingLocks = new Map<string, number>(); // key -> lock expiry (ms epoch)

  constructor(
    @Optional() private readonly cacheService?: DashboardCacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const method = String(req?.method ?? 'GET').toUpperCase();

    // Idempotency applies to mutating requests only
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();

    const url = String(req?.originalUrl ?? req?.url ?? '');
    const headerKey = req.headers?.['x-idempotency-key'] || req.headers?.['x-idempotency-token'];

    // Targets: SKIP, OPEN END, assign, mid-change, delete-guarded, hard-delete
    const isIdempotencyTarget = Boolean(headerKey) || /\/(cable-action|assign|mid-change|hard-delete|delete-guarded|confirm-upload)(\/|$)/i.test(url);
    if (!isIdempotencyTarget) return next.handle();

    const userId = req.user?.id ?? 'anon';
    const key = typeof headerKey === 'string' && headerKey.trim().length > 0
      ? `idempotency:key:${headerKey.trim()}`
      : `idempotency:hash:${userId}:${url}:${createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex')}`;

    // 1. Check cache for previously recorded execution
    let cached = await this.readCache(key);
    if (cached) return this.replay(context, cached);

    // 2. Atomic in-flight lock to prevent concurrent duplicate mutation race conditions
    let lockOwner = await this.acquireLock(key);

    if (!lockOwner) {
      // Another request with the same key is already processing. Wait for it to
      // finish and replay its result instead of rejecting — ten concurrent retries
      // of the same mutation must all observe the one real outcome, not a 409.
      const winner = await this.waitForResult(key);
      if (winner) return this.replay(context, winner);

      // The original holder never finished (crashed, or its lock TTL lapsed without
      // caching a result). Its lock has since expired — take over rather than fail.
      lockOwner = await this.acquireLock(key);
      if (!lockOwner) {
        throw new ConflictException('A request with this idempotency key is currently processing');
      }
    }

    const owner = lockOwner;

    return next.handle().pipe(
      tap(result => {
        if (this.cacheService) {
          void this.cacheService.releaseLock(key, owner);
        } else {
          this.processingLocks.delete(key);
        }
        
        const reply = context.switchToHttp().getResponse();
        const statusCode = reply?.statusCode ?? 200;
        const entry = { status: statusCode, body: result };
        this.inMemoryCache.set(key, entry);
        this.cacheService?.set(key, entry, 86_400_000); // 24 Hours TTL

        if (this.inMemoryCache.size > 2000) {
          const firstKey = this.inMemoryCache.keys().next().value;
          if (firstKey) this.inMemoryCache.delete(firstKey);
        }
      }),
      catchError(err => {
        if (this.cacheService) {
          void this.cacheService.releaseLock(key, owner);
        } else {
          this.processingLocks.delete(key);
        }
        throw err;
      }),
    );
  }

  private async readCache(key: string): Promise<{ status: number; body: any } | undefined> {
    const local = this.inMemoryCache.get(key);
    if (local) return local;
    if (this.cacheService) {
      return this.cacheService.getAsync<{ status: number; body: any }>(key);
    }
    return undefined;
  }

  private replay(context: ExecutionContext, cached: { status: number; body: any }): Observable<any> {
    const req = context.switchToHttp().getRequest();
    // Downstream interceptors (event publish, cache invalidation) must not re-fire for
    // a replayed response — nothing new happened, regardless of global interceptor order.
    if (req) req.__dwesIdempotentReplay = true;
    const reply = context.switchToHttp().getResponse();
    if (typeof reply?.status === 'function') reply.status(cached.status);
    return of(cached.body);
  }

  private async acquireLock(key: string): Promise<string | false> {
    if (this.cacheService) {
      return this.cacheService.acquireLock(key, LOCK_TTL_MS);
    }
    const now = Date.now();
    const existing = this.processingLocks.get(key);
    if (existing && existing > now) return false;
    const owner = `${process.pid}-${now}-${Math.random().toString(36).slice(2, 10)}`;
    this.processingLocks.set(key, now + LOCK_TTL_MS);
    return owner;
  }

  /** Polls for the in-flight holder's cached result until it appears or WAIT_TIMEOUT_MS elapses. */
  private async waitForResult(key: string): Promise<{ status: number; body: any } | undefined> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      const cached = await this.readCache(key);
      if (cached) return cached;
    }
    return undefined;
  }
}
