import { useState } from 'react';
import { directorApi } from '../../../services/api';
import { FileSpreadsheet, FileText, File, ArrowUpRight, Check, Download } from '../../../components/ui/icons';

interface ExportTabProps {
  stats: any;
}

export default function ExportTab({ stats }: ExportTabProps) {
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | 'pdf' | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [error, setError] = useState('');

  const doExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(format); setError('');
    try {
      const blob = await directorApi.export(format);
      const mimeMap: Record<string, string> = {
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv',
        pdf: 'application/pdf',
      };
      const url = URL.createObjectURL(new Blob([blob], { type: mimeMap[format] }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `dwes-director-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(new Date().toLocaleString());
    } catch { setError(`Export failed — please try again`); }
    finally { setExporting(null); }
  };

  const EXPORT_SHEETS = [
    { title: 'KPI Summary', desc: 'Composite KPI, wiring progress, QC pass rate, all counts' },
    { title: 'Projects', desc: 'Per-project: panels, cables, KPI%, wiring hours, QC rate' },
    { title: 'Workforce', desc: 'Per-technician: panels, KPI%, wiring hours, QC pass/fail' },
  ];

  return (
    <div>
      <div className="export-grid">
        <div className="export-card">
          <div className="export-head">
            <div className="export-icon success"><FileSpreadsheet size={24} /></div>
            <div>
              <div className="export-title">Excel Export (.xlsx)</div>
              <div className="export-sub">Full dashboard with 3 sheets</div>
            </div>
          </div>

          <div className="export-list">
            {EXPORT_SHEETS.map(s => (
              <div key={s.title} className="export-list-row">
                <span className="export-list-bullet success"><ArrowUpRight size={14} /></span>
                <div>
                  <span className="export-list-title">{s.title}</span>
                  <span className="export-list-desc"> — {s.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => doExport('xlsx')} disabled={!!exporting} className="btn-success export-btn" type="button">
            {exporting === 'xlsx' ? null : <Download size={18} />}
            <span>{exporting === 'xlsx' ? 'Exporting…' : 'Download Excel'}</span>
          </button>
        </div>

        <div className="export-card">
          <div className="export-head">
            <div className="export-icon progress"><FileText size={24} /></div>
            <div>
              <div className="export-title">CSV Export (.csv)</div>
              <div className="export-sub">Flat format for BI tools</div>
            </div>
          </div>

          <div className="export-list">
            {['KPI Summary section', 'Projects table', 'Workforce table'].map(s => (
              <div key={s} className="export-list-row">
                <span className="export-list-bullet progress"><ArrowUpRight size={14} /></span>
                <span className="export-list-row-copy">{s}</span>
              </div>
            ))}
            <div className="export-list-note">All sections in single file, separated by headers</div>
          </div>

          <button onClick={() => doExport('csv')} disabled={!!exporting} className="btn-primary export-btn" type="button">
            {exporting === 'csv' ? null : <Download size={18} />}
            <span>{exporting === 'csv' ? 'Exporting…' : 'Download CSV'}</span>
          </button>
        </div>

        <div className="export-card">
          <div className="export-head">
            <div className="export-icon danger"><File size={24} /></div>
            <div>
              <div className="export-title">PDF Report (.pdf)</div>
              <div className="export-sub">Non-editable formatted report</div>
            </div>
          </div>

          <div className="export-list">
            {['KPI Summary with gauges', 'Project progress table', 'Workforce table'].map(s => (
              <div key={s} className="export-list-row">
                <span className="export-list-bullet danger"><ArrowUpRight size={14} /></span>
                <span className="export-list-row-copy">{s}</span>
              </div>
            ))}
            <div className="export-list-note">A4 formatted — read-only, suitable for distribution</div>
          </div>

          <button onClick={() => doExport('pdf')} disabled={!!exporting} className="btn-danger export-btn" type="button">
            {exporting === 'pdf' ? null : <Download size={18} />}
            <span>{exporting === 'pdf' ? 'Generating PDF…' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error mb-4">
          {error}
        </div>
      )}

      {lastExport && (
        <div className="flash-ok mb-4 flex items-center gap-2">
          <Check size={16} />
          <span>Last exported: {lastExport}</span>
        </div>
      )}

      {stats && (
        <div className="export-card">
          <div className="export-snapshot-label">Current Snapshot (will be included in export)</div>
          <div className="export-snapshot-grid">
            {[
              { label: 'Composite KPI', val: `${stats.composite_kpi}%`, tone: 'progress' },
              { label: 'Wiring KPI', val: `${stats.wiring_kpi}%`, tone: 'completed' },
              { label: 'QC Pass Rate', val: `${stats.qc_pass_rate}%`, tone: 'qaqc' },
              { label: 'Projects', val: stats.projects_total, tone: 'muted' },
              { label: 'Panels Done', val: stats.panels_completed, tone: 'completed' },
              { label: 'Cables Total', val: stats.cables_total?.toLocaleString(), tone: 'muted' },
              { label: 'Wiring Hours', val: `${stats.total_wiring_hours}h`, tone: 'warning' },
              { label: 'QC Inspections', val: stats.qc_inspections, tone: 'qaqc' },
            ].map(k => (
              <div key={k.label} className="export-snapshot-card">
                <div className="export-snapshot-value" data-tone={k.tone}>{k.val}</div>
                <div className="export-snapshot-item-label mt-1">{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
