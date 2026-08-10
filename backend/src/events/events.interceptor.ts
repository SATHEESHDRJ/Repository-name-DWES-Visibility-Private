import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EventsService, type DwesEventScope, type DwesServerEvent } from './events.service';
import { DashboardCacheService } from '../common/cache/dashboard-cache.service';

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

/** Pull the project code / frame id out of the route params, whatever the route shape. */
function locate(params: Record<string, string> | undefined, body: unknown) {
  const p = params ?? {};
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const projectCode = p.code ?? p.projectCode ?? (typeof b.project_code === 'string' ? b.project_code : undefined);
  const frameId = p.frameId ?? p.id ?? (typeof b.frame_id === 'string' ? b.frame_id : undefined);
  return { projectCode, frameId };
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
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = String(req?.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();

    const url = String(req?.originalUrl ?? req?.url ?? '');
    if (!url.startsWith('/api/')) return next.handle();

    return next.handle().pipe(
      tap(() => {
        // A replayed idempotent response (see IdempotencyInterceptor) did not perform a
        // new mutation — publishing here would broadcast a duplicate event for one change.
        if (req?.__dwesIdempotentReplay) return;

        // Only successful responses reach tap(); an exception short-circuits it,
        // so a failed upload never signals a change that did not happen.
        const scope = scopeFor(url);
        // Frames/panels routes are the only place a panel-scoped id is meaningful.
        const { projectCode, frameId } = locate(req?.params, req?.body);
        const originId = req?.headers?.['x-dwes-client-id'];
        
        // Invalidate read-heavy summary caches on any successful mutation
        this.cacheService?.invalidateSummaryCaches();

        this.events.publish({
          scope,
          action: actionFor(method, url),
          projectCode,
          frameId: scope === 'panel' ? frameId : (/\/hard-delete(\/|$|\?)/i.test(url) ? undefined : frameId),
          actorId: typeof req?.user?.id === 'number' ? req.user.id : undefined,
          originId: typeof originId === 'string' ? originId : undefined,
        });
      }),
    );
  }
}
