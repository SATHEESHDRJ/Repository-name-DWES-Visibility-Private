import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import Redis from 'ioredis';

/** Scopes mirror the frontend event bus so one server event maps to one silent refresh. */
export type DwesEventScope = 'project' | 'panel' | 'document' | 'assignment' | 'inspection' | 'engineering' | 'general';

export interface DwesServerEvent {
  scope: DwesEventScope;
  /** create | update | delete — lets a client drop a row without refetching everything. */
  action: 'created' | 'updated' | 'deleted';
  projectCode?: string;
  frameId?: string;
  /** Emitting user — informational only. */
  actorId?: number;
  /**
   * The browser tab that made the change (X-DWES-Client-Id). That tab skips this echo
   * because it already refreshed locally; every other tab — including the same user on
   * another device — still applies it.
   */
  originId?: string;
  at: string;
}

/**
 * Local SSE fan-out bridged across API replicas through Redis Pub/Sub or PostgreSQL LISTEN/NOTIFY.
 * If REDIS_URL is provided, Redis is prioritized for multi-instance cloud deployments;
 * otherwise it degrades to PostgreSQL LISTEN/NOTIFY or local RxJS Subject.
 */
@Injectable()
export class EventsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(EventsService.name);
  private readonly stream = new Subject<DwesServerEvent>();
  private readonly instanceId = randomUUID();
  private client: Client | null = null;
  private redisSub: Redis | null = null;
  private redisPub: Redis | null = null;
  private redisReady = false;
  private pgReady = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionString = '';
  private redisUrl = '';
  private stopping = false;

  async onModuleInit(): Promise<void> {
    this.connectionString = process.env.DATABASE_URL?.trim() ?? '';
    this.redisUrl = process.env.REDIS_URL?.trim() ?? '';

    if (this.redisUrl && process.env.DWES_REDIS_EVENT_FANOUT !== 'false') {
      await this.connectRedis();
    }
    if (!this.redisReady && this.connectionString && process.env.DWES_PG_EVENT_FANOUT !== 'false') {
      await this.connectFanout();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.redisReady = false;
    this.pgReady = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    if (this.redisSub) {
      this.redisSub.disconnect();
      this.redisSub = null;
    }
    if (this.redisPub) {
      this.redisPub.disconnect();
      this.redisPub = null;
    }

    const client = this.client;
    this.client = null;
    if (client) await client.end().catch(() => undefined);
  }

  private async connectRedis(): Promise<void> {
    if (this.stopping || !this.redisUrl) return;
    try {
      const sub = new Redis(this.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
      const pub = new Redis(this.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });

      await Promise.all([sub.connect(), pub.connect()]);

      await sub.subscribe('dwes_events');
      sub.on('message', (channel, message) => {
        if (channel !== 'dwes_events') return;
        try {
          const envelope = JSON.parse(message) as { instanceId?: unknown; event?: unknown };
          if (envelope.instanceId !== this.instanceId && this.isEvent(envelope.event)) {
            this.stream.next(envelope.event);
          }
        } catch { /* ignore malformed */ }
      });

      const handleErr = (err: Error) => {
        if (this.redisReady) {
          this.redisReady = false;
          this.logger.warn(`Redis Pub/Sub disconnected: ${err.message}`);
          this.scheduleReconnect();
        }
      };

      sub.on('error', handleErr);
      pub.on('error', handleErr);

      this.redisSub = sub;
      this.redisPub = pub;
      this.redisReady = true;
      this.logger.log('Redis Pub/Sub event fan-out active');
    } catch (err) {
      this.logger.warn(`Redis event fan-out unavailable (${err instanceof Error ? err.message : 'failed'}); falling back to PG/local SSE`);
      this.redisReady = false;
      this.scheduleReconnect();
    }
  }

  private async connectFanout(): Promise<void> {
    if (this.stopping || this.client || !this.connectionString || this.redisReady) return;
    const client = new Client({ connectionString: this.connectionString, application_name: `dwes-events-${process.pid}` });
    client.on('notification', message => {
      if (message.channel !== 'dwes_events' || !message.payload) return;
      try {
        const envelope = JSON.parse(message.payload) as { instanceId?: unknown; event?: unknown };
        if (envelope.instanceId === this.instanceId || !this.isEvent(envelope.event)) return;
        this.stream.next(envelope.event);
      } catch {
        // Malformed database notifications are ignored; REST/polling remains authoritative.
      }
    });
    client.on('error', error => {
      this.handleFanoutFailure(client, error.message);
    });
    try {
      await client.connect();
      await client.query('LISTEN dwes_events');
      if (this.stopping) {
        await client.end().catch(() => undefined);
        return;
      }
      this.client = client;
      this.pgReady = true;
    } catch (error) {
      this.logger.warn(`PostgreSQL event fan-out unavailable; local SSE remains active: ${error instanceof Error ? error.message : 'connection failed'}`);
      await client.end().catch(() => undefined);
      this.scheduleReconnect();
    }
  }

  private handleFanoutFailure(client: Client, detail: string): void {
    if (this.client !== client && this.client !== null) return;
    this.pgReady = false;
    if (this.client === client) this.client = null;
    this.logger.warn(`PostgreSQL event fan-out unavailable; local SSE remains active: ${detail}`);
    void client.end().catch(() => undefined);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.redisUrl && !this.redisReady) {
        void this.connectRedis();
      } else if (this.connectionString && !this.pgReady) {
        void this.connectFanout();
      }
    }, 5_000);
    this.reconnectTimer.unref();
  }

  publish(event: Omit<DwesServerEvent, 'at'>): void {
    const complete = { ...event, at: new Date().toISOString() } satisfies DwesServerEvent;
    this.stream.next(complete);

    const payload = JSON.stringify({ instanceId: this.instanceId, event: complete });

    if (this.redisReady && this.redisPub) {
      try {
        void this.redisPub.publish('dwes_events', payload).catch(err => {
          this.logger.warn(`Redis publish failed: ${err instanceof Error ? err.message : 'publish error'}`);
        });
      } catch (err) {
        this.logger.warn(`Redis publish failed: ${err instanceof Error ? err.message : 'write error'}`);
      }
    } else if (this.pgReady && this.client) {
      const client = this.client;
      void client.query('SELECT pg_notify($1, $2)', ['dwes_events', payload]).catch(error => {
        this.handleFanoutFailure(client, error instanceof Error ? error.message : 'publish failed');
      });
    }
  }

  asObservable(): Observable<DwesServerEvent> {
    return this.stream.asObservable();
  }

  getFanoutStatus(): { mode: 'redis' | 'pg' | 'local'; redisReady: boolean; pgReady: boolean } {
    return {
      mode: this.redisReady ? 'redis' : this.pgReady ? 'pg' : 'local',
      redisReady: this.redisReady,
      pgReady: this.pgReady,
    };
  }

  private isEvent(value: unknown): value is DwesServerEvent {
    if (!value || Array.isArray(value) || typeof value !== 'object') return false;
    const event = value as Record<string, unknown>;
    return ['project', 'panel', 'document', 'assignment', 'inspection', 'engineering', 'general'].includes(String(event.scope))
      && ['created', 'updated', 'deleted'].includes(String(event.action))
      && typeof event.at === 'string';
  }
}

