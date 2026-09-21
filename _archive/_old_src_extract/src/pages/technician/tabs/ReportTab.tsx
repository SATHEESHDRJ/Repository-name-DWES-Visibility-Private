import { useEffect, useState } from 'react';
import { ClipboardCheck, Send } from 'lucide-react';
import { techApi } from '../../../services/api';
import { useAppDialog } from '../../../components/AppDialogProvider';

interface ReportTabProps {
  panel: any | null;
  onPanelUpdate: () => void;
}

export default function ReportTab({ panel, onPanelUpdate }: ReportTabProps) {
  const dialog = useAppDialog();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!panel) return;
    setLoading(true);
    techApi.report(panel.id)
      .then(data => {
        setReport(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [panel]);

  const handleSubmit = async () => {
    const ok = await dialog.confirm({
      title: 'Submit Panel Report',
      message: 'This finalizes your work on this panel. Submit now?',
      tone: 'save',
      confirmText: 'Submit',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await techApi.submitReport(panel.id);
      setSubmitted(true);
      onPanelUpdate();
    } catch {
      // keep current behavior
    } finally {
      setSubmitting(false);
    }
  };

  if (!panel) {
    return (
      <div className="dwes-empty-state">
        <div className="dwes-empty-title">Select a completed panel</div>
        <div className="dwes-empty-copy">
          Open a completed assignment from My Panels to review and submit its report.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading report</div></div>;
  }

  if (!report) {
    return <div className="dwes-error">Could not load report.</div>;
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  };

  const kpi = report.cables_total > 0
    ? Math.round(((report.cables_src_done + report.cables_dst_done) / (report.cables_total * 2)) * 100)
    : 0;

  const alreadySubmitted = panel.report_submitted || submitted;

  return (
    <div>
      <section className="report-card">
        <div className="report-title-row">
          <div>
            <div className="report-title">{report.panel_name}</div>
            <div className="progress-meta">{report.project_code}</div>
          </div>
          {alreadySubmitted ? (
            <span className="status-chip" data-tone="completed">Report Submitted</span>
          ) : panel.status === 'completed' ? (
            <button className="dwes-button dwes-button-primary" onClick={handleSubmit} disabled={submitting} type="button">
              <Send size={18} />
              <span>{submitting ? 'Submitting' : 'Submit Report'}</span>
            </button>
          ) : (
            <span className="status-chip" data-tone="warning">Complete wiring to enable submit</span>
          )}
        </div>
      </section>

      <section className="report-kpi-grid mb-md">
        {[
          { label: 'Total Cables', value: report.cables_total, color: 'var(--text)' },
          { label: 'Source Done', value: `${report.cables_src_done} / ${report.cables_total}`, color: 'var(--status-source)' },
          { label: 'Destination Done', value: `${report.cables_dst_done} / ${report.cables_total}`, color: 'var(--status-destination)' },
          { label: 'Overall KPI', value: `${kpi}%`, color: 'var(--status-progress)' },
          { label: 'Wiring Time', value: formatTime(report.total_wiring_seconds || 0), color: 'var(--status-completed)' },
          { label: 'Review Status', value: (report.review_status || 'pending').replace(/_/g, ' '), color: 'var(--text-muted)' },
        ].map(item => (
          <div key={item.label} className="report-kpi" data-tone={item.label.toLowerCase().replace(/\s+/g, '_')}>
            <div className="report-kpi-value">{item.value}</div>
            <div className="report-kpi-label">{item.label}</div>
          </div>
        ))}
      </section>

      <section className="report-card">
        <div className="dwes-label mb-sm">Cable Completion Summary</div>
        <div className="report-summary-grid">
          <div className="terminal-card" data-tone="completed">
            <div className="terminal-title" data-tone="completed">Completed</div>
            <div className="cable-path-value">{report.cables_both_done ?? 0}</div>
          </div>
          <div className="terminal-card" data-tone="source">
            <div className="terminal-title" data-tone="source">Source Only</div>
            <div className="cable-path-value">
              {(report.cables_src_done ?? 0) - (report.cables_both_done ?? 0)}
            </div>
          </div>
          <div className="terminal-card" data-tone="destination">
            <div className="terminal-title" data-tone="destination">Destination Only</div>
            <div className="cable-path-value">
              {(report.cables_dst_done ?? 0) - (report.cables_both_done ?? 0)}
            </div>
          </div>
          <div className="terminal-card" data-tone="pending">
            <div className="terminal-title" data-tone="pending">Pending</div>
            <div className="cable-path-value">
              {(report.cables_total ?? 0) - Math.max(report.cables_src_done ?? 0, report.cables_dst_done ?? 0)}
            </div>
          </div>
        </div>
      </section>

      {report.audit_trail?.length > 0 && (
        <section className="report-card">
          <div className="dwes-label mb-sm">Audit Trail</div>
          <div className="timeline-list">
            {report.audit_trail.map((entry: any, index: number) => (
              <div key={index} className="timeline-row">
                <span className="timeline-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className="timeline-action">{entry.action}</span>
                <span className="timeline-copy">{entry.details}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!alreadySubmitted && panel.status === 'completed' && (
        <div className="tech-strip mt-md" data-tone="warning">
          <ClipboardCheck size={18} className="icon-gap-sm" />
          Submit the report once your source and destination completion looks correct.
        </div>
      )}
    </div>
  );
}
