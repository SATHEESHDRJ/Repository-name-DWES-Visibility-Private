import { UserCog, TriangleAlert, Activity, Clock, PlayCircle, PauseCircle, CheckCircle2, RefreshCw, Hash, Calendar, ArrowRight } from '../ui/icons';
import type { PanelActivityData } from '../../types';

function formatActivityDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'not_started': return { icon: <Clock size={14} strokeWidth={2.5} />, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' };
    case 'in_progress': return { icon: <PlayCircle size={14} strokeWidth={2.5} />, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
    case 'paused':
    case 'lunch_break':
    case 'tea_break': return { icon: <PauseCircle size={14} strokeWidth={2.5} />, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
    case 'completed': return { icon: <CheckCircle2 size={14} strokeWidth={2.5} />, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    default: return { icon: <Activity size={14} strokeWidth={2.5} />, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' };
  }
}

export default function PanelTechnicianActivity({
  activity,
  loading,
  error,
}: {
  activity: PanelActivityData | null;
  loading: boolean;
  error: string;
}) {
  if (loading && !activity) {
    return (
      <div className="mt-5 pt-5 border-t border-slate-200" aria-label="Technician activity" aria-busy="true">
        <div className="pj-tech-activity-skeleton is-wide mb-3" />
        <div className="pj-tech-activity-skeleton" />
      </div>
    );
  }

  if (error && !activity) {
    return (
      <div className="mt-5 pt-5 border-t border-slate-200 flex items-center gap-2 text-red-600 text-[13px] font-medium bg-red-50 p-3 rounded-lg border border-red-100">
        <TriangleAlert size={16} aria-hidden />
        <span>{error}</span>
      </div>
    );
  }

  if (!activity) return null;

  const technicianName = activity.technician?.name || 'Not Assigned';
  const technicianUsername = activity.technician?.username ? `@${activity.technician.username}` : '';
  const progress = Math.min(100, Math.max(0, activity.completion_percentage || 0));
  const conf = getStatusConfig(activity.status);

  return (
    <div className="mt-5 pt-5 border-t border-slate-100">
      {/* Header and Live Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-800">
          <UserCog size={16} className="text-blue-600" />
          <h4 className="text-[13px] font-bold m-0">Technician Activity</h4>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${conf.bg} ${conf.color} ${conf.border}`}>
          {conf.icon}
          <span>{activity.status_label}</span>
        </div>
      </div>

      {/* Modern Compact Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Assigned Technician</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-slate-800 truncate" title={technicianName}>{technicianName}</span>
            {technicianUsername && <span className="text-[11px] font-medium text-slate-500">{technicianUsername}</span>}
          </div>
        </div>
        
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Assignment Time</span>
          <span className="text-[12px] font-medium text-slate-700 flex items-center gap-1.5"><Calendar size={12} className="text-slate-400"/> {formatActivityDateTime(activity.assigned_at)}</span>
        </div>

        {activity.has_started && (
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Wiring Started</span>
            <span className="text-[12px] font-medium text-slate-700 flex items-center gap-1.5"><PlayCircle size={12} className="text-green-500"/> {formatActivityDateTime(activity.wiring_started_at)}</span>
          </div>
        )}

        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Last Activity</span>
          <span className="text-[12px] font-medium text-slate-700 flex items-center gap-1.5"><Activity size={12} className="text-blue-500"/> {formatActivityDateTime(activity.last_activity_at)}</span>
        </div>
      </div>

      {/* Pause Status */}
      {activity.pause_reason && ['paused', 'lunch_break', 'tea_break'].includes(activity.status) && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50/80 border border-amber-200/60 rounded-lg p-2.5">
          <PauseCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <span className="block text-[11px] font-bold text-amber-800 uppercase tracking-wide">Work Paused</span>
            <span className="text-[12px] font-medium text-amber-700/90">{activity.pause_reason}</span>
          </div>
        </div>
      )}

      {/* Progress Section */}
      <div className="bg-slate-50 rounded-xl border border-slate-200/70 p-3 mb-4">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
          <span>Wiring Progress</span>
          <span className="text-blue-700 font-extrabold text-[12px]">{progress}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-3">
            <span><strong className="text-slate-800 font-bold">{activity.cables_completed}</strong> done</span>
            <span className="text-slate-300">|</span>
            <span><strong className="text-slate-800 font-bold">{activity.cables_remaining}</strong> left</span>
          </div>
          <span className="flex items-center gap-1"><Hash size={12} className="text-slate-400"/> <strong className="text-slate-800 font-bold">{activity.cables_total}</strong> total</span>
        </div>
      </div>

      {/* Mid Change History */}
      {activity.mid_change?.occurred && (
        <div className="mb-4 bg-purple-50/50 border border-purple-200/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <RefreshCw size={12} className="text-purple-600" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-purple-800">Mid Change Handover</span>
            </div>
            <span className="text-[10px] font-medium text-purple-600/80">{formatActivityDateTime(activity.mid_change.changed_at)}</span>
          </div>
          
          <div className="flex items-stretch gap-1">
            <div className="flex-1 bg-white border border-purple-100 rounded-lg p-2 flex flex-col justify-center shadow-sm">
              <span className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Original</span>
              <span className="text-[11.5px] font-bold text-slate-700 truncate">{activity.mid_change.original_technician.name}</span>
              <span className="text-[10px] font-medium text-slate-500">{activity.mid_change.original_technician.cables_completed} cables</span>
            </div>
            <div className="flex items-center px-1">
              <ArrowRight size={14} className="text-purple-300" />
            </div>
            <div className="flex-1 bg-purple-100/50 border border-purple-200/60 rounded-lg p-2 flex flex-col justify-center relative overflow-hidden shadow-sm">
              <div className={`absolute top-0 right-0 w-1.5 h-full ${activity.mid_change.incoming_started ? 'bg-purple-500' : 'bg-slate-300'}`} />
              <span className="text-[9px] font-bold uppercase text-purple-600 mb-0.5">Incoming</span>
              <span className="text-[11.5px] font-bold text-purple-900 truncate pr-2">{activity.mid_change.incoming_technician.name}</span>
              <span className="text-[10px] font-medium text-purple-700/80 pr-2">{activity.mid_change.incoming_technician.cables_completed} cables</span>
            </div>
          </div>
        </div>
      )}

      {/* Final Completion Status */}
      {activity.is_completed && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80">Completed By</span>
              <span className="text-[12px] font-bold">
                {activity.completed_by?.name || technicianName}
                {activity.completed_by?.username && <span className="font-medium text-emerald-600/90 ml-1">@{activity.completed_by.username}</span>}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-700">{formatActivityDateTime(activity.completed_at)}</span>
        </div>
      )}
    </div>
  );
}
