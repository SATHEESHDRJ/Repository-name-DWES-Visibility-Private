import { useEffect, useState } from 'react';
import { projectsApi, supervisorApi } from '../../../services/api';
import type { Project } from '../../../types';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';

type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc';

export default function ReviewTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selProject, setSelProject] = useState('');
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReview, setShowReview] = useState<any>(null);
  const [showReport, setShowReport] = useState<any>(null);

  useEffect(() => {
    projectsApi.list().then(data => {
      setProjects(data);
      if (data.length) setSelProject(data[0].code);
    });
  }, []);

  const loadPanels = () => {
    if (!selProject) return;
    setLoading(true);
    supervisorApi.reviewPanels(selProject)
      .then(data => {
        setPanels(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(loadPanels, [selProject]);

  return (
    <div>
      <div className="table-toolbar">
        <select value={selProject} onChange={event => setSelProject(event.target.value)} className="dwes-select review-project-select">
          {projects.map(project => <option key={project.code} value={project.code}>{project.name}</option>)}
        </select>
      </div>

      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading panels...</div></div>}

      {!loading && panels.length === 0 && (
        <div className="dwes-empty-state">
          <div className="dwes-empty-copy">No completed panels to review for this project.</div>
        </div>
      )}

      <div className="stack-grid">
        {panels.map(panel => (
          <div key={panel.id} className="review-card">
            <div className="review-main">
              <div className="review-title">{panel.panel_name}</div>
              <div className="review-sub mt-xxs">
                {panel.technician_name} · Completed {panel.completed_at ? new Date(panel.completed_at).toLocaleDateString() : 'unknown'}
              </div>
            </div>

            <div className="review-kpi">
              <div className="review-kpi-value">{panel.kpi ?? 0}%</div>
              <div className="review-kpi-label">KPI</div>
            </div>

            <div className="review-progress">
              <div className="review-progress-value">{panel.cables_src_done}/{panel.total_cables}</div>
              <div className="review-progress-label">src done</div>
            </div>

            <Badge label={panel.review_status || 'completed'} />

            <div className="touch-action-row">
              <button onClick={() => setShowReport(panel)} className="button-compact" type="button">Report</button>
              <button onClick={() => setShowReview(panel)} className="button-compact" type="button">Review</button>
            </div>
          </div>
        ))}
      </div>

      {showReview && (
        <ReviewModal panel={showReview} onClose={() => setShowReview(null)} onSaved={loadPanels} />
      )}

      {showReport && (
        <PanelReportModal panel={showReport} projectCode={selProject} onClose={() => setShowReport(null)} />
      )}
    </div>
  );
}

function ReviewModal({ panel, onClose, onSaved }: { panel: any; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<ReviewStatus>('approved');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await supervisorApi.review(panel.id, status, notes);
      onSaved();
      onClose();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Review failed');
    } finally {
      setSaving(false);
    }
  };

  const statusOptions: { value: ReviewStatus; label: string }[] = [
    { value: 'approved', label: 'Approved - Accepted as-is' },
    { value: 'ready_for_qc', label: 'Ready for QA/QC - Send to QA team' },
    { value: 'rework', label: 'Rework Required - Return to tech' },
  ];

  return (
    <Modal
      title="Review Panel"
      onClose={onClose}
      footer={(
        <>
          <button onClick={onClose} className="dwes-button dwes-button-neutral" type="button">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="dwes-button dwes-button-primary" type="button">{saving ? 'Saving...' : 'Submit Review'}</button>
        </>
      )}
    >
      <div className="review-modal-copy mb-md">
        Panel: <span className="review-modal-strong">{panel.panel_name}</span>
      </div>

      <div className="mb-md">
        <label className="dwes-label mb-xxs">Decision</label>
        <div className="radio-list">
          {statusOptions.map(option => (
            <label key={option.value} className={`radio-card ${status === option.value ? 'is-active' : ''}`}>
              <input type="radio" checked={status === option.value} onChange={() => setStatus(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="dwes-label mb-xxs">Notes (optional)</label>
        <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} placeholder="Additional review notes..." className="dwes-textarea" />
      </div>

      {error && <div className="dwes-error mt-sm">{error}</div>}
    </Modal>
  );
}

function PanelReportModal({ panel, projectCode, onClose }: { panel: any; projectCode: string; onClose: () => void }) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supervisorApi.panelReport(projectCode, panel.frame_id || panel.id)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [panel.id, projectCode, panel.frame_id]);

  const downloadXlsx = () => {
    supervisorApi.panelReportXlsx(projectCode, panel.frame_id || panel.id).then(blob => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${panel.panel_name}_report.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <Modal
      title={`Panel Report - ${panel.panel_name}`}
      onClose={onClose}
      width={820}
      footer={(
        <>
          <button onClick={downloadXlsx} className="dwes-button dwes-button-success" type="button">Download XLSX</button>
          <button onClick={onClose} className="dwes-button dwes-button-neutral" type="button">Close</button>
        </>
      )}
    >
      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading report...</div></div>}
      {!loading && !report && <div className="dwes-error">Could not load report data.</div>}

      {!loading && report && (
        <div>
          <div className="sessions-summary-grid mb-md">
            {[
              { label: 'Total Cables', value: report.total_cables ?? 0, tone: 'muted' },
              { label: 'Src Done', value: report.cables_src_done ?? 0, tone: 'completed' },
              { label: 'Dst Done', value: report.cables_dst_done ?? 0, tone: 'progress' },
              { label: 'KPI', value: `${report.kpi ?? 0}%`, tone: 'qaqc' },
            ].map(summary => (
              <div key={summary.label} className="sessions-summary-card">
                <div className="sessions-summary-value" data-tone={summary.tone}>{summary.value}</div>
                <div className="sessions-summary-label mt-xxs">{summary.label}</div>
              </div>
            ))}
          </div>

          {report.cables && (
            <div className="dwes-table-wrap">
              <table className="dwes-table">
                <thead>
                  <tr>
                    {['#', 'Ferrule', 'Source', 'Destination', 'Src', 'Dst', 'Note'].map(header => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.cables.map((cable: any, index: number) => (
                    <tr key={index}>
                      <td>{cable.sno}</td>
                      <td className="table-cell-mono">{cable.ferrule}</td>
                      <td>{cable.source}</td>
                      <td>{cable.destination}</td>
                      <td>{cable.status?.src_done ? '✓' : '-'}</td>
                      <td>{cable.status?.dst_done ? '✓' : '-'}</td>
                      <td>{cable.status?.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
