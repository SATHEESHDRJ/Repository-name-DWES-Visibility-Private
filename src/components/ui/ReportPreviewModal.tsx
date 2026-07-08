import { useCallback, useEffect, useState } from 'react';
import CompanyLogo from './CompanyLogo';
import Modal from '../Modal';
import { supervisorApi } from '../../services/api';
import { useReadOnlyPoll } from '../../hooks/useReadOnlyPoll';
import type { CompletionReportData } from './CompletionReport';
import {
  User, Building2, Cable, Clock, CheckCircle, Download,
  PauseCircle, FileText, AlertCircle,
} from './icons';

interface ReportPreviewModalProps {
  assignmentId: number;
  projectCode: string;
  frameId: string;
  panelName: string;
  onClose: () => void;
  /** Technician submit flow — preview first, then call on submit */
  onSubmit?: () => void | Promise<void>;
  submitting?: boolean;
  /** Override report API (default: supervisor completion report) */
  loadReport?: (assignmentId: number) => Promise<CompletionReportData>;
  showExport?: boolean;
}

function fmtDateTime(dt: string | null) {
  if (!dt) return '--';
  return new Date(dt).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(dt: string | null) {
  if (!dt) return '';
  return new Date(dt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ReportPreviewModal({
  assignmentId,
  projectCode,
  frameId,
  panelName,
  onClose,
  onSubmit,
  submitting = false,
  loadReport = supervisorApi.completionReport,
  showExport = true,
}: ReportPreviewModalProps) {
  const [report, setReport] = useState<CompletionReportData | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    const data = await loadReport(assignmentId);
    setReport(data);
  }, [assignmentId, loadReport]);

  useEffect(() => {
    fetchReport().catch(() => setFailed(true));
  }, [fetchReport]);

  // Live preview — refresh while the modal stays open (pauses on hidden tab)
  useReadOnlyPoll(fetchReport, 6000);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const blob = await supervisorApi.panelReportXlsx(projectCode, frameId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${panelName}_report.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      /* keep modal open; export is optional */
    } finally {
      setExporting(false);
    }
  };

  const a = report?.assignment;
  const completionPct = a && a.cables_total > 0
    ? Math.round((a.cables_both_done / a.cables_total) * 100)
    : 0;

  return (
    <Modal
      title="Report Preview"
      onClose={onClose}
      size="xl"
      footer={(
        <>
          {showExport && (
            <button onClick={exportXlsx} disabled={exporting || !report} className="btn-secondary" type="button">
              <Download size={16} />
              <span>{exporting ? 'Exporting…' : 'Export XLSX'}</span>
            </button>
          )}
          {onSubmit ? (
            <>
              <button onClick={onClose} className="btn-secondary" type="button" disabled={submitting}>Cancel</button>
              <button
                onClick={() => void onSubmit()}
                disabled={submitting || !report}
                className="btn-primary"
                type="button"
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="btn-primary" type="button">Close</button>
          )}
        </>
      )}
    >
      {!report && !failed && (
        <div className="empty-state"><p className="empty-text">Loading report…</p></div>
      )}
      {failed && !report && (
        <div className="form-error">Could not load report data.</div>
      )}

      {report && a && (
        <div className="flex flex-col gap-4">

          {/* ── Identity header: logo + technician + project/panel + live badge ── */}
          <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4 flex flex-wrap items-center gap-4">
            <CompanyLogo variant="white" size="sm" className="shrink-0" />
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <User size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-white truncate">{report.technician.full_name}</div>
                <div className="text-[12px] text-slate-300 truncate select-none">
                  Technician{report.technician.employee_id && <> · <span className="font-mono">{report.technician.employee_id}</span></>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <Building2 size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-white truncate">{report.project.name}</div>
                <div className="text-[12px] text-slate-300 truncate select-none">
                  Panel: <span className="font-semibold text-slate-100">{a.panel_name}</span>
                </div>
              </div>
            </div>
            <span className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full select-none shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>

          {/* ── KPI cards: Total Hours / Total Cables / Completion ── */}
          <div className="grid grid-cols-1 tablet-port:grid-cols-2 tablet-land:grid-cols-3 gap-3">
            <div className="kpi-card" data-variant="blue">
              <div className="kpi-icon-wrap"><Clock size={20} /></div>
              <div className="kpi-content">
                <span className="kpi-value-base kpi-value-blue">{a.duration_human || '--'}</span>
                <span className="kpi-label">Total Hours (technician)</span>
              </div>
            </div>
            <div className="kpi-card" data-variant="default">
              <div className="kpi-icon-wrap"><Cable size={20} /></div>
              <div className="kpi-content">
                <span className="kpi-value-base kpi-value">{a.cables_total}</span>
                <span className="kpi-label">Total Cable Assignment</span>
              </div>
            </div>
            <div className="kpi-card" data-variant="green">
              <div className="kpi-icon-wrap"><CheckCircle size={20} /></div>
              <div className="kpi-content">
                <span className="kpi-value-base kpi-value-green">{completionPct}%</span>
                <span className="kpi-label">Completion</span>
              </div>
            </div>
          </div>

          {/* ── Cable completion status + progress bar ── */}
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">Cable Completion Status</span>
              <span className="text-[14px] font-bold text-slate-800 tabular-nums">
                {a.cables_both_done}/{a.cables_total} <span className="font-medium text-slate-500">cables completed</span>
              </span>
            </div>
            <progress className="cr-progress w-full" data-tone="overall" data-h="10" value={Math.min(completionPct, 100)} max={100} />
          </div>

          {/* ── Start / End time ── */}
          <div className="grid grid-cols-1 tablet-port:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1 select-none">Start Time</div>
              <div className="text-[15px] font-bold text-slate-800">{fmtDateTime(a.started_at)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1 select-none">End Time</div>
              <div className="text-[15px] font-bold text-slate-800">{fmtDateTime(a.completed_at)}</div>
            </div>
          </div>

          {/* ── Break reason log ── */}
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <PauseCircle size={16} className="text-amber-600" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">Break Reason Log</span>
            </div>
            {(report.break_log?.length ?? 0) === 0 ? (
              <div className="text-[13px] text-slate-400 select-none">No breaks recorded.</div>
            ) : (
              <ul className="flex flex-col gap-2">
                {report.break_log!.map((entry, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                    <span className="text-[13px] font-medium text-slate-700 min-w-0 truncate" title={entry.reason}>{entry.reason}</span>
                    <span className="text-[12px] text-slate-500 tabular-nums shrink-0">{fmtTime(entry.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Technician notes / remarks ── */}
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-blue-600" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">Technician Notes / Remarks</span>
            </div>
            {(report.technician_notes?.length ?? 0) === 0 ? (
              <div className="text-[13px] text-slate-400 select-none">No notes recorded for this panel.</div>
            ) : (
              <ul className="flex flex-col gap-2">
                {report.technician_notes!.map((note, index) => (
                  <li key={index} className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                    {note.issue
                      ? <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                      : <FileText size={16} className="text-slate-400 shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">Cable #{note.cable_index}</span>
                      <p className="text-[13px] text-slate-700 mt-0.5 break-words">{note.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-[11px] text-slate-400 text-right select-none">
            Live preview · refreshes every 6s · last updated {new Date(report.generated_at).toLocaleTimeString()}
          </div>
        </div>
      )}
    </Modal>
  );
}
