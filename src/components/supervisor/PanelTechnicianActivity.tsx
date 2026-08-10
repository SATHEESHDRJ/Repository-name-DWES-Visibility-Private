import { Activity, Clock, PlayCircle, RefreshCw, TriangleAlert, User } from '../ui/icons';
import type { PanelActivityData } from '../../types';

function formatActivityDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Compact Assigned Technician block for Project Information — name plus
 * Assigned At, Wiring Started, and Last Action only.
 */
export default function PanelTechnicianActivity({
  activity,
  loading,
  error,
  compact = false,
}: {
  activity: PanelActivityData | null;
  loading: boolean;
  error: string;
  compact?: boolean;
}) {
  const blockClass = compact ? 'assigned-tech-block assigned-tech-block--compact' : 'assigned-tech-block';

  if (loading && !activity) {
    return (
      <div className={`${blockClass} animate-pulse`}>
        <div className="h-4 bg-slate-100 rounded w-2/5" />
        <div className="h-3 bg-slate-100 rounded w-3/5 mt-2" />
      </div>
    );
  }

  if (error && !activity) {
    return (
      <p className="assigned-tech-block-error" role="alert">
        <TriangleAlert size={14} aria-hidden />
        {error}
      </p>
    );
  }

  const technicianName = activity?.technician?.name?.trim() || 'Not Assigned';
  const isUnassigned = technicianName === 'Not Assigned';

  if (!activity && !loading && !error) {
    return (
      <div className={blockClass} aria-label="Assigned Technician">
        <span className="pj-overview-badge pj-overview-badge--unassigned">Not Assigned</span>
        <div className="assigned-tech-timestamps">
          <span className="assigned-tech-ts">
            <Clock size={14} filled aria-hidden />
            <span>Assigned At: —</span>
          </span>
          <span className="assigned-tech-ts">
            <Activity size={14} filled aria-hidden />
            <span>Last Action: —</span>
          </span>
        </div>
      </div>
    );
  }

  if (!activity) return null;

  return (
    <div className={blockClass} aria-label="Assigned Technician">
      {isUnassigned ? (
        <span className="pj-overview-badge pj-overview-badge--unassigned">{technicianName}</span>
      ) : (
        <p className="assigned-tech-name">{technicianName}</p>
      )}
      <div className="assigned-tech-timestamps">
        <span className="assigned-tech-ts">
          <Clock size={14} filled aria-hidden />
          <span>Assigned At: {formatActivityDateTime(activity.assigned_at)}</span>
        </span>
        {activity.has_started && (
          <span className="assigned-tech-ts">
            <PlayCircle size={14} filled aria-hidden />
            <span>Wiring Started: {formatActivityDateTime(activity.wiring_started_at)}</span>
          </span>
        )}
        <span className="assigned-tech-ts">
          <Activity size={14} filled aria-hidden />
          <span>Last Action: {formatActivityDateTime(activity.last_activity_at)}</span>
        </span>
      </div>
      {activity.pause_reason && ['paused', 'lunch_break', 'tea_break'].includes(activity.status) && (
        <p className="assigned-tech-pause">
          <User size={13} aria-hidden />
          Paused — {activity.pause_reason}
        </p>
      )}
      {activity.mid_change?.occurred && (
        <details className="assigned-tech-midchange">
          <summary>
            <RefreshCw size={13} aria-hidden />
            Mid Change — {formatActivityDateTime(activity.mid_change.changed_at)}
          </summary>
          <p className="assigned-tech-midchange-detail">
            {activity.mid_change.original_technician.name}
            {' → '}
            {activity.mid_change.incoming_technician.name}
            {' · '}
            {activity.mid_change.original_technician.cables_completed} / {activity.mid_change.incoming_technician.cables_completed} cables
          </p>
        </details>
      )}
    </div>
  );
}
