import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/** Scopes mirror the frontend event bus so one server event maps to one silent refresh. */
export type DwesEventScope = 'project' | 'panel' | 'document' | 'assignment' | 'inspection' | 'general';

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
 * In-process fan-out of data-change events to every connected client (SSE).
 * Single-instance by design — DWES runs one backend process; clients fall back
 * to polling if the stream is unavailable.
 */
@Injectable()
export class EventsService {
  private readonly stream = new Subject<DwesServerEvent>();

  publish(event: Omit<DwesServerEvent, 'at'>): void {
    this.stream.next({ ...event, at: new Date().toISOString() });
  }

  asObservable(): Observable<DwesServerEvent> {
    return this.stream.asObservable();
  }
}
