import { User, Building2, Cable, Clock, BarChart3, CheckCircle, AlertCircle, FileSpreadsheet } from './icons';
import CompanyLogo from './CompanyLogo';

export interface CompletionReportData {
  technician: { full_name: string; username: string; employee_id: string | null };
  project: { code: string; name: string; client: string | null };
  assignment: {
    id: number;
    panel_name: string;
    frame_id: string;
    status: string;
    cables_total: number;
    cables_src_done: number;
    cables_dst_done: number;
    cables_both_done: number;
    cables_pending: number;
    kpi: number;
    src_pct: number;
    dst_pct: number;
    started_at: string | null;
    completed_at: string | null;
    total_wiring_seconds: number;
    duration_human: string;
    review_status: string | null;
    report_submitted: boolean;
  };
  rollup: { total_frames: number; completed_frames: number; project_kpi: number };
  break_log?: { reason: string; at: string | null }[];
  technician_notes?: { cable_index: number; note: string; issue: boolean }[];
  generated_at: string;
}

interface CompletionReportProps {
  data: CompletionReportData;
  onDownloadXlsx?: () => void;
  compact?: boolean;
}

function ProgressBar({ value, tone, height = 8 }: { value: number; tone: 'source' | 'destination' | 'overall' | 'rollup'; height?: number }) {
  return (
    <progress
      className="cr-progress w-full"
      data-tone={tone}
      data-h={String(height)}
      value={Math.min(value, 100)}
      max={100}
    />
  );
}

function StatBlock({ value, label, tone }: { value: number | string; label: string; tone?: 'blue' | 'orange' | 'green' | 'red' | 'gray' }) {
  const textColors: Record<string, string> = {
    blue: 'text-blue-700', orange: 'text-orange-600', green: 'text-green-700',
    red: 'text-red-600', gray: 'text-slate-600',
  };
  return (
    <div className="flex flex-col items-center px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 min-w-[72px]">
      <div className={`text-[20px] font-bold tabular-nums leading-none ${tone ? textColors[tone] : 'text-slate-800'}`}>{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 select-none">{label}</div>
    </div>
  );
}

function fmt(dt: string | null) {
  if (!dt) return '--';
  return new Date(dt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CompletionReport({ data, onDownloadXlsx, compact = false }: CompletionReportProps) {
  const { technician, project, assignment: a, rollup } = data;
  const isCompleted = a.status === 'completed' || a.status === 'approved';

  return (
    <div className="flex flex-col gap-0 rounded-2xl border border-slate-200 bg-[var(--t-surface-white)] overflow-hidden shadow-sm">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center gap-3">
        <CompanyLogo variant="white" size="sm" className="shrink-0" />
        {isCompleted
          ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
          : <AlertCircle size={20} className="text-amber-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-white break-words [overflow-wrap:anywhere] select-none">{a.panel_name}</div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5 select-none">{project.code}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {a.report_submitted && (
            <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full select-none">
              SUBMITTED
            </span>
          )}
          {onDownloadXlsx && (
            <button
              type="button"
              onClick={onDownloadXlsx}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-[var(--t-surface-white-10)] hover:bg-[var(--t-surface-white-20)] text-white text-[11px] font-semibold transition-colors"
            >
              <FileSpreadsheet size={12} />
              <span>XLSX</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Identity row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 tablet-port:grid-cols-2 divide-y tablet-port:divide-y-0 tablet-port:divide-x divide-slate-100">
        {/* Technician */}
        <div className="px-5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <User size={16} className="text-blue-700" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-slate-800 break-words [overflow-wrap:anywhere]">{technician.full_name}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 select-none">
              @{technician.username}
              {technician.employee_id && <> · <span className="font-mono">{technician.employee_id}</span></>}
            </div>
          </div>
        </div>
        {/* Project */}
        <div className="px-5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <Building2 size={16} className="text-slate-600" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-slate-800 break-words [overflow-wrap:anywhere]">{project.name}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 select-none">
              {project.client && <>{project.client} · </>}
              <span className="font-mono">{project.code}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Cable Progress ────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Cable size={14} className="text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">Cable Progress</span>
        </div>

        {/* Overall bar */}
        <div className="flex items-center gap-3 mb-1">
          <div className="flex-1">
            <ProgressBar value={a.kpi} tone="overall" height={10} />
          </div>
          <div className="text-[18px] font-bold text-blue-700 tabular-nums shrink-0 min-w-[3.5ch]">{a.kpi}%</div>
        </div>
        <div className="text-[11px] text-slate-500 mb-3 select-none">
          {a.cables_both_done} of {a.cables_total} cables fully completed ({a.kpi}%)
        </div>

        {/* Stat blocks */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <StatBlock value={a.cables_both_done} label="Complete" tone="green" />
          <StatBlock value={a.cables_src_done}  label="Src Done" tone="blue" />
          <StatBlock value={a.cables_dst_done}  label="Dst Done" tone="orange" />
          <StatBlock value={a.cables_pending}   label="Pending" tone="gray" />
        </div>

        {/* Dual progress bars */}
        {!compact && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 select-none">Source</span>
                <span className="text-[10px] font-bold tabular-nums text-blue-700">{a.cables_src_done}/{a.cables_total}</span>
              </div>
              <ProgressBar value={a.src_pct} tone="source" height={6} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 select-none">Destination</span>
                <span className="text-[10px] font-bold tabular-nums text-orange-600">{a.cables_dst_done}/{a.cables_total}</span>
              </div>
              <ProgressBar value={a.dst_pct} tone="destination" height={6} />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Timing ──────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} className="text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">Time Tracking</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 select-none">Started</div>
            <div className="text-[12px] font-semibold text-slate-700">{fmt(a.started_at)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 select-none">Completed</div>
            <div className="text-[12px] font-semibold text-slate-700">{fmt(a.completed_at)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 select-none">Duration</div>
            <div className="text-[14px] font-bold text-slate-800">{a.duration_human || '--'}</div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Project Rollup ──────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">Project Rollup</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={rollup.project_kpi} tone="rollup" height={8} />
          </div>
          <span className="text-[13px] font-bold text-green-700 tabular-nums shrink-0">{rollup.project_kpi}%</span>
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500 select-none">
          {rollup.completed_frames} of {rollup.total_frames} panel{rollup.total_frames !== 1 ? 's' : ''} completed in {project.name}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="px-5 py-2 bg-slate-50 border-t border-slate-100">
        <div className="text-[10px] text-slate-400 select-none">
          Report generated {new Date(data.generated_at).toLocaleString()}
          {a.review_status && (
            <> · Review: <span className="font-semibold capitalize">{a.review_status.replace(/_/g, ' ')}</span></>
          )}
        </div>
      </div>
    </div>
  );
}
