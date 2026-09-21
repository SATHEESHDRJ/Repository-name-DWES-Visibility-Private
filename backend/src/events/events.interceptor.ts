import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EventsService, type DwesEventScope, type DwesServerEvent } from './events.service';
import { DashboardCacheService } from '../common/cache/dashboard-cache.service';
import { PrismaService } from '../prisma/prisma.service';

/** Path fragments that identify what a mutation touched, most specific first. */
const SCOPE_RULES: Array<{ test: RegExp; scope: DwesEventScope }> = [
  { test: /\/(drawing|drawings|model|upload)(\/|$)/i, scope: 'document' },
  { test: /\/(inspect-panel|inspection)/i, scope: 'inspection' },
  { test: /\/(tech|supervisor)\//i, scope: 'assignment' },
  { test: /\/frames(\/|$)/i, scope: 'panel' },
  { test: /\/projects(\/|$)/i, scope: 'project' },
];

function scopeFor(url: string): DwesEventScope {
  return SCOPE_RULES.find(rule => rule.test.test(url))?.scope ?? 'general';
}

function actionFor(method: string, url: string): DwesServerEvent['action'] {
  if (method === 'DELETE') return 'deleted';
  // Guarded / hard permanent deletes use POST (confirm body) but must refresh clients as deleted.
  if (/\/(hard-delete|delete-guarded)(\/|$|\?)/i.test(url)) return 'deleted';
  if (method === 'POST') return 'created';
  return 'updated';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Pull project / frame / assignment / wire scope from route params, body, or response. */
function locate(
  params: Record<string, string> | undefined,
  body: unknown,
  response?: unknown,
) {
  const p = params ?? {};
  const b = asRecord(body);
  const r = asRecord(response);
  const projectCode =
    p.code
    ?? p.projectCode
    ?? (typeof b.project_code === 'string' ? b.project_code : undefined)
    ?? (typeof r.project_code === 'string' ? r.project_code : undefined);
  const frameId =
    p.frameId
    ?? (typeof b.frame_id === 'string' ? b.frame_id : undefined)
    ?? (typeof r.frame_id === 'string' ? r.frame_id : undefined)
    // Panel routes may use :id as frame id; assignment routes must not.
    ?? (typeof p.id === 'string' && !b.assignment_id && !r.assignment_id ? p.id : undefined);
  const assignmentIdRaw =
    b.assignment_id
    ?? b.old_assignment_id
    ?? r.assignment_id
    ?? r.new_assignment_id
    ?? p.assignmentId;
  const assignmentId = typeof assignmentIdRaw === 'number'
    ? assignmentIdRaw
    : (typeof assignmentIdRaw === 'string' && /^\d+$/.test(assignmentIdRaw)
      ? Number(assignmentIdRaw)
      : undefined);
  const cableIndexRaw = b.cable_index ?? r.cable_index;
  const cableIndex = typeof cableIndexRaw === 'number'
    ? cableIndexRaw
    : (typeof cableIndexRaw === 'string' && /^\d+$/.test(cableIndexRaw)
      ? Number(cableIndexRaw)
      : undefined);
  const wireId =
    (typeof r.wire_id === 'string' && r.wire_id.trim() ? r.wire_id.trim() : undefined)
    ?? (typeof b.wire_id === 'string' && b.wire_id.trim() ? b.wire_id.trim() : undefined);
  const previousWireId =
    typeof r.previous_wire_id === 'string' && r.previous_wire_id.trim()
      ? r.previous_wire_id.trim()
      : undefined;
  const nextWireId =
    typeof r.next_wire_id === 'string' && r.next_wire_id.trim()
      ? r.next_wire_id.trim()
      : undefined;
  const nextCableIndexRaw = r.next_cable_index;
  const nextCableIndex = typeof nextCableIndexRaw === 'number'
    ? nextCableIndexRaw
    : (typeof nextCableIndexRaw === 'string' && /^\d+$/.test(nextCableIndexRaw)
      ? Number(nextCableIndexRaw)
      : undefined);
  return { projectCode, frameId, assignmentId, cableIndex, wireId, previousWireId, nextWireId, nextCableIndex };
}

/**
 * Publishes one change event after every successful mutating request, so other
 * signed-in users refresh only the affected data instead of polling blindly.
 * Read requests are never published.
 */
@Injectable()
export class EventsInterceptor implements NestInterceptor {
  constructor(
    private readonly events: EventsService,
    @Optional() private readonly cacheService?: DashboardCacheService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = String(req?.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();

    const url = String(req?.originalUrl ?? req?.url ?? '');
    if (!url.startsWith('/api/')) return next.handle();

    return next.handle().pipe(
      tap((responseBody) => {
        // A replayed idempotent response (see IdempotencyInterceptor) did not perform a
        // new mutation — publishing here would broadcast a duplicate event for one change.
        if (req?.__dwesIdempotentReplay) return;

        // Only successful responses reach tap(); an exception short-circuits it,
        // so a failed upload never signals a change that did not happen.
        const scope = scopeFor(url);
        const located = locate(req?.params, req?.body, responseBody);
        const originId = req?.headers?.['x-dwes-client-id'];

        // Invalidate read-heavy summary caches on any successful mutation
        this.cacheService?.invalidateSummaryCaches();

        void this.publishEnriched({
          scope,
          action: actionFor(method, url),
          projectCode: located.projectCode,
          frameId: scope === 'panel'
            ? located.frameId
            : (/\/hard-delete(\/|$|\?)/i.test(url) ? undefined : located.frameId),
          assignmentId: located.assignmentId,
          cableIndex: located.cableIndex,
          wireId: located.wireId,
          previousWireId: located.previousWireId,
          nextWireId: located.nextWireId,
          nextCableIndex: located.nextCableIndex,
          actorId: typeof req?.user?.id === 'number' ? req.user.id : undefined,
          originId: typeof originId === 'string' ? originId : undefined,
        });
      }),
    );
  }

  /**
   * Enrich assignment-scoped mutations (crimping stages) with project/frame/wire
   * when the request body only carried assignment_id / cable_index.
   */
  private async publishEnriched(event: Omit<DwesServerEvent, 'at'>): Promise<void> {
    let projectCode = event.projectCode;
    let frameId = event.frameId;
    let wireId = event.wireId;

    if (this.prisma && event.assignmentId != null && (!projectCode || !frameId)) {
      try {
        const assignment = await this.prisma.tech_assignments.findUnique({
          where: { id: event.assignmentId },
          select: { project_code: true, frame_id: true, panel_name: true },
        });
        if (assignment) {
          projectCode = projectCode || assignment.project_code;
          frameId = frameId || assignment.frame_id;
        }
      } catch {
        /* lookup failure must not block publish — clients keep polling fallback */
      }
    }

    if (!wireId && event.cableIndex != null) {
      wireId = String(event.cableIndex + 1);
    }

    this.events.publish({
      ...event,
      projectCode,
      frameId,
      wireId,
    });
  }
}
