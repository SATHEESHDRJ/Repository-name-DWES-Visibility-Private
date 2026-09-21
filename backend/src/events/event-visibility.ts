import type { DwesServerEvent } from './events.service';

/** Roles that may observe every change in the system (read-only dashboards or admin). */
const GLOBAL_OBSERVER_ROLES = new Set(['system_admin', 'prod_supervisor', 'ops_director']);

/** QA/QC follows panel and inspection lifecycle, not drawing/model uploads. */
const QAQC_SCOPES = new Set(['panel', 'project', 'assignment', 'inspection', 'engineering']);

export interface EventAudience {
  role: string | null;
  /** Frame ids this technician is currently assigned to. Empty for other roles. */
  assignedFrameIds: Set<string>;
}

/**
 * Role-based event filtering. A client is only told about changes it is allowed to
 * see, so a technician never learns about panels or projects they are not assigned to.
 * This mirrors the REST authorization rules — the stream must not widen them.
 */
export function canReceiveEvent(event: DwesServerEvent, audience: EventAudience): boolean {
  const { role, assignedFrameIds } = audience;
  if (!role) return false;
  if (GLOBAL_OBSERVER_ROLES.has(role)) return true;

  if (role === 'qaqc_engineer') return QAQC_SCOPES.has(event.scope);

  if (role === 'wiring_technician') {
    // Assignment changes may be the event that grants or removes access, so the
    // technician must see them to re-read their own panel list.
    if (event.scope === 'assignment') return true;
    // Everything else must name a panel the technician currently holds.
    return !!event.frameId && assignedFrameIds.has(event.frameId);
  }

  return false;
}
