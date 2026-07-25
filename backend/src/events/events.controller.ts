import { Controller, Header, Sse, UseGuards } from '@nestjs/common';
import { Observable, from, map, merge, mergeMap, filter, timer } from 'rxjs';
import { EventsService, type DwesServerEvent } from './events.service';
import { canReceiveEvent, type EventAudience } from './event-visibility';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../data/mock-store';

interface SseMessage {
  data: DwesServerEvent | { scope: 'heartbeat'; at: string };
}

/** Keeps proxies from closing an idle stream and lets the client detect a dead link. */
const HEARTBEAT_MS = 25_000;

/** A technician's assignment list rarely changes; re-read it at most this often. */
const ASSIGNMENT_CACHE_MS = 10_000;

@Controller('api/events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Live change stream for signed-in users, filtered by role: a client is only sent
   * changes it is already authorized to read. Clients apply each event to only the
   * affected project/panel/row; polling remains the fallback if this drops.
   */
  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  // Tell reverse proxies not to buffer this response, so live updates are not held back
  // until a buffer fills. nginx honours X-Accel-Buffering even without `proxy_buffering
  // off`, which keeps the stream correct behind a proxy DWES does not control.
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('Connection', 'keep-alive')
  stream(@CurrentUser() user: User): Observable<SseMessage> {
    const audience = this.audienceFor(user);

    const changes = this.events.asObservable().pipe(
      mergeMap(event => from(audience()).pipe(
        filter(scope => canReceiveEvent(event, scope)),
        map(() => ({ data: event })),
      )),
    );

    // Emit immediately so a client only declares the stream live after an actual
    // SSE body frame has traversed every proxy, then keep idle connections open.
    const heartbeat = timer(0, HEARTBEAT_MS).pipe(
      map(() => ({ data: { scope: 'heartbeat' as const, at: new Date().toISOString() } })),
    );

    return merge(changes, heartbeat);
  }

  /** Resolves (and briefly caches) what this connection is allowed to observe. */
  private audienceFor(user: User): () => Promise<EventAudience> {
    const role = user?.role ?? null;
    let cached: EventAudience | null = null;
    let cachedAt = 0;

    return async () => {
      if (role !== 'wiring_technician') return { role, assignedFrameIds: new Set<string>() };

      const now = Date.now();
      if (cached && now - cachedAt < ASSIGNMENT_CACHE_MS) return cached;

      const rows = await this.prisma.tech_assignments.findMany({
        where: { technician_id: user.id, is_hidden: { not: true } },
        select: { frame_id: true },
      });
      cached = { role, assignedFrameIds: new Set(rows.map(row => row.frame_id)) };
      cachedAt = now;
      return cached;
    };
  }
}
