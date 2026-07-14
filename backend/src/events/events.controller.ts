import { Controller, Sse, UseGuards } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';
import { EventsService, type DwesServerEvent } from './events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface SseMessage {
  data: DwesServerEvent | { scope: 'heartbeat'; at: string };
}

/** Keeps proxies from closing an idle stream and lets the client detect a dead link. */
const HEARTBEAT_MS = 25_000;

@Controller('api/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Live change stream for signed-in users. Clients apply each event to only the
   * affected project/panel/row; polling remains the fallback if this drops.
   */
  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(): Observable<SseMessage> {
    const changes = this.events.asObservable().pipe(map(event => ({ data: event })));
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map(() => ({ data: { scope: 'heartbeat' as const, at: new Date().toISOString() } })),
    );
    return merge(changes, heartbeat);
  }
}
