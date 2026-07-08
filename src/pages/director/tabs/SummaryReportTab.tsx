import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, RefreshCw } from '../../../components/ui/icons';
import { directorApi } from '../../../services/api';
import { useReadOnlyPoll } from '../../../hooks/useReadOnlyPoll';

interface PanelRow {
  panelName: string;
  frameId: string;
  assignmentId: number;
  status: string;
  cablesTotal: number;
  cablesSrcDone: number;
  cablesDstDone: number;
  wiringPct: number;
  technicianName: string;
  reviewStatus: string | null;
  qcStatus: string | null;
}

interface ProjectSummary {
  project: {
    code: string;
    name: string;
    client: string;
    state: string | null;
    panelCount: number;
    panelsCompleted: number;
    panelsInProgress: number;
    totalCables: number;
    cablesSrcDone: number;
    cablesDstDone: number;
    wiringPct: number;
  };
  panels: PanelRow[];
}

function formatUpdated(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return date.toLocaleTimeString();
}

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Assigned', in_progress: 'In Progress', paused: 'Paused',
  completed: 'Completed', draft: 'Draft', verified: 'Verified', not_started: 'Not Started',
};
const STATUS_CLS: Record<string, string> = {
  assigned:    'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  paused:      'bg-orange-100 text-orange-700',
  completed:   'bg-green-100 text-green-700',
  draft:       'bg-slate-100 text-slate-500',
  verified:    'bg-blue-50 text-blue-500',
  not_started: 'bg-slate-100 text-slate-400',
};

const QC_LABEL: Record<string, string> = {
  approved:    'Approved',
  rejected:    'Rejected',
  ready_for_qc:'Ready',
  pending:     'Pending',
  not_ready:   '—',
};
const QC_CLS: Record<string, string> = {
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
  ready_for_qc: 'bg-amber-100 text-amber-700',
  pending:      'bg-amber-50 text-amber-600',
  not_ready:    'bg-slate-50 text-slate-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`dr-status-badge inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${STATUS_CLS[status] ?? 'bg-slate-100 text-slate-500'}`} data-status={status}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function QcBadge({ reviewStatus, qcStatus }: { reviewStatus: string | null; qcStatus: string | null }) {
  const key = reviewStatus || qcStatus || 'not_ready';
  return (
    <span className={`dr-qc-badge inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${QC_CLS[key] ?? 'bg-slate-50 text-slate-400'}`} data-qc={key}>
      {QC_LABEL[key] ?? key}
    </span>
  );
}

function MiniBar({ pct }: { pct: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fillRef.current?.style.setProperty('--report-bar-pct', `${pct}%`);
  }, [pct]);
  return (
    <div className="flex items-center gap-2">
      <div className="dr-mini-track flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[48px]">
        <div ref={fillRef} className="report-bar-fill" />
      </div>
      <span className="text-[12px] font-mono text-slate-700 w-9 text-right shrink-0">{pct}%</span>
    </div>
  );
}

function ProjectBar({ pct }: { pct: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fillRef.current?.style.setProperty('--report-proj-pct', `${pct}%`);
  }, [pct]);
  return (
    <div className="dr-proj-track w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-2">
      <div ref={fillRef} className="report-proj-fill" />
    </div>
  );
}

function ProjectCard({
  data, isOpen, onToggle,
}: { data: ProjectSummary; isOpen: boolean; onToggle: () => void }) {
  const { project, panels } = data;
  return (
    <div className="dr-card bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="dr-toggle w-full flex items-start gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        type="button"
        aria-expanded={isOpen}
      >
        <div className="mt-0.5 text-slate-400 shrink-0">
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
        <div className="dr-card-head flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
            <span className="font-mono text-[13px] font-bold text-slate-800 uppercase tracking-wide">
              {project.code}
            </span>
            {project.name && (
              <span className="text-[13px] text-slate-600 truncate">{project.name}</span>
            )}
            {project.client && (
              <span className="text-[11px] text-slate-400 shrink-0">· {project.client}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
            <span>{project.panelCount} panel{project.panelCount !== 1 ? 's' : ''}</span>
            <span className="text-slate-300">·</span>
            <span className="text-green-600 font-medium">{project.panelsCompleted} done</span>
            <span className="text-slate-300">·</span>
            <span className="text-blue-600 font-medium">{project.wiringPct}% wired</span>
            <span className="text-slate-300">·</span>
            <span>{project.totalCables.toLocaleString()} cables</span>
            {project.cablesSrcDone > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">
                  src {project.cablesSrcDone} / dst {project.cablesDstDone}
                </span>
              </>
            )}
          </div>
          <ProjectBar pct={project.wiringPct} />
        </div>
      </button>

      {isOpen && (
        <div className="dr-table-wrap border-t border-slate-100 overflow-x-auto">
          {panels.length === 0 ? (
            <div className="px-5 py-6 text-[13px] text-slate-400 italic">No panels assigned yet</div>
          ) : (
            <table className="w-full min-w-[680px] text-[13px] border-collapse">
              <thead className="dr-thead">
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
                  <th className="px-4 py-2.5 text-left">Panel</th>
                  <th className="px-3 py-2.5 text-left w-[130px]">Status</th>
                  <th className="px-3 py-2.5 text-left w-[140px]">Wiring %</th>
                  <th className="px-3 py-2.5 text-center w-[160px]">Cables (src / dst / total)</th>
                  <th className="px-3 py-2.5 text-left w-[160px]">Technician</th>
                  <th className="px-3 py-2.5 text-center w-[100px]">QC</th>
                </tr>
              </thead>
              <tbody>
                {panels.map((p, idx) => (
                  <tr
                    key={p.assignmentId}
                    className={`dr-row border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${idx % 2 === 1 ? 'dr-row-alt bg-slate-50/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 truncate max-w-[200px]" title={p.panelName}>
                        {p.panelName}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">
                        {p.frameId}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-3 pr-5">
                      <MiniBar pct={p.wiringPct} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-mono text-[12px]">
                        <span className="text-blue-600 font-semibold">{p.cablesSrcDone}</span>
                        <span className="text-slate-300"> / </span>
                        <span className="text-amber-600 font-semibold">{p.cablesDstDone}</span>
                        <span className="text-slate-300"> / </span>
                        <span className="text-slate-500">{p.cablesTotal}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700 truncate max-w-[150px]">
                      {p.technicianName}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <QcBadge reviewStatus={p.reviewStatus} qcStatus={p.qcStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function SummaryReportTab() {
  const [data, setData] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result: ProjectSummary[] = await directorApi.projectsSummary();
      setData(result);
      const now = new Date();
      setUpdatedAt(now);
      setOpen(prev => {
        const next = { ...prev };
        for (const d of result) {
          if (!(d.project.code in next)) next[d.project.code] = true;
        }
        return next;
      });
    } catch { /* silent — stale data stays visible */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useReadOnlyPoll(fetchData, 4000);

  // Tick every 15 s so "N ago" label updates without a full fetch
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const toggleAll = (expand: boolean) => {
    setOpen(prev => Object.fromEntries(Object.keys(prev).map(k => [k, expand])));
  };

  const doExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const blob = await directorApi.export(format);
      const mime = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `dwes-director-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    finally { setExporting(null); }
  };

  return (
    <div className="dr-report flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-bold text-slate-800">Projects Summary</h2>
          {updatedAt && (
            <p className="text-[12px] text-slate-400 mt-0.5">Updated {formatUpdated(updatedAt)}</p>
          )}
        </div>

        <div className="flex items-center gap-1 text-[12px]">
          <button
            onClick={() => toggleAll(true)}
            type="button"
            className="dr-link px-2 py-1 text-blue-600 hover:underline"
          >
            Expand all
          </button>
          <span className="text-slate-200">|</span>
          <button
            onClick={() => toggleAll(false)}
            type="button"
            className="dr-link px-2 py-1 text-blue-600 hover:underline"
          >
            Collapse all
          </button>
        </div>

        <button
          onClick={fetchData}
          type="button"
          className="dr-btn-refresh h-14 bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.97] shrink-0"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Export strip */}
      <div className="dr-export-strip flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
        <span className="text-[12px] text-slate-500 font-medium">Export:</span>
        <button
          onClick={() => doExport('xlsx')}
          disabled={!!exporting}
          type="button"
          className="dr-export-btn bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
        >
          <Download size={14} />
          {exporting === 'xlsx' ? 'Exporting…' : 'Excel (.xlsx)'}
        </button>
        <button
          onClick={() => doExport('csv')}
          disabled={!!exporting}
          type="button"
          className="dr-export-btn bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
        >
          <Download size={14} />
          {exporting === 'csv' ? 'Exporting…' : 'CSV (.csv)'}
        </button>
      </div>

      {/* Project cards */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-[14px]">Loading summary…</div>
      ) : data.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-[14px]">No projects found</div>
      ) : (
        <div className="flex flex-col gap-3 pb-6">
          {data.map(d => (
            <ProjectCard
              key={d.project.code}
              data={d}
              isOpen={open[d.project.code] ?? true}
              onToggle={() =>
                setOpen(prev => ({ ...prev, [d.project.code]: !prev[d.project.code] }))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
