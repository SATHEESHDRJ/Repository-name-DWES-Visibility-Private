import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Activity, CheckCheck, ChevronDown, ChevronUp, Clock3, Download, FileText, Eye, RefreshCw } from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import Modal from '../../components/Modal';
import ReportPreviewModal from '../../components/ui/ReportPreviewModal';
import { useAuthStore } from '../../store/useAuthStore';
import { directorApi, projectsApi } from '../../services/api';
import { useLatestRequest } from '../../hooks/useLatestRequest';

interface PanelStatus {
  panelName: string;
  frameId: string;
  assignmentId: number;
  status: 'Active' | 'Completed';
  cablesTotal: number;
  cablesCompleted: number;
  cablesRemaining: number;
  kpi: number;
  technicianName: string;
  workingHours: number;
}

interface ProjectStatus {
  project: {
    code: string;
    name: string;
    client: string | null;
    status: 'Active' | 'Completed';
    panelCount: number;
    panelsCompleted: number;
    totalCables: number;
    completedCables: number;
    remainingCables: number;
    kpi: number;
    workingHours: number;
  };
  panels: PanelStatus[];
}

const assignedCableKpi = (completed: number, assigned: number) => {
  if (assigned <= 0) return 0;
  const safeCompleted = Math.max(0, Math.min(completed, assigned));
  return Math.round((safeCompleted / assigned) * 1000) / 10;
};

const displayPercent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

function StatusPill({ status }: { status: 'Active' | 'Completed' }) {
  return (
    <span className={`director-live-status director-live-status--${status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {status}
    </span>
  );
}

function KpiRing({ value, size = 'panel' }: { value: number; size?: 'project' | 'panel' }) {
  const safeValue = Math.max(0, Math.min(value, 100));
  return (
    <div
      className={`director-kpi-ring director-kpi-ring--${size}`}
      style={{ '--director-kpi': `${safeValue * 3.6}deg` } as CSSProperties}
      aria-label={`${displayPercent(safeValue)} assigned cable KPI`}
      title="Completed assigned cables ÷ total assigned cables × 100"
    >
      <div><strong>{displayPercent(safeValue)}</strong><span>KPI</span></div>
    </div>
  );
}

function CableMetric({ label, value, tone }: { label: string; value: number; tone?: 'completed' | 'remaining' }) {
  return (
    <div className="director-cable-metric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

export default function DirectorDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [data, setData] = useState<ProjectStatus[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [reportTarget, setReportTarget] = useState<{ project: ProjectStatus['project']; panel: PanelStatus } | null>(null);
  const [liveTarget, setLiveTarget] = useState<{ project: ProjectStatus['project']; panel: PanelStatus } | null>(null);
  const [downloadingProject, setDownloadingProject] = useState<string | null>(null);
  const requests = useLatestRequest();

  const isSales = user?.role === 'sales_director';

  const fetchData = useCallback(async (silent = false) => {
    const request = requests.begin();
    if (!silent) setLoading(true);
    if (!silent) setData([]);
    try {
      const [s, result] = await Promise.all([
        directorApi.stats(request.signal),
        directorApi.projectsSummary(request.signal)
      ]);
      if (!requests.isLatest(request.id)) return;
      setStats(s);
      setData(result);
      setUpdatedAt(new Date());
      setExpanded(current => Object.fromEntries(result.map((item: ProjectStatus) => [item.project.code, current[item.project.code] ?? true])));
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED' && requests.isLatest(request.id)) {
        setStats(null);
        if (!silent) setData([]);
      }
    } finally {
      if (requests.isLatest(request.id)) setLoading(false);
    }
  }, [requests]);

  useEffect(() => { void fetchData(false); }, [fetchData]);

  const downloadProjectReport = async (project: ProjectStatus['project']) => {
    setDownloadingProject(project.code);
    try {
      const blob = await projectsApi.reportPdf(project.code);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Report_${project.code}_${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingProject(null);
    }
  };

  const title = isSales ? 'Sales Director' : 'Operations Director';
  const subtitle = `${user?.full_name || ''} · ${user?.employee_id || ''} · Enterprise overview`;

  return (
    <DashboardShell
      title={title}
      subtitle={subtitle}
      badge="Read Only"
      badgeVariant="gray"
      widthVariant="wide"
      kpis={stats ? [
        { label: 'Completed', value: stats.panels_completed, color: 'completed', icon: <CheckCheck size={24} /> },
        { label: 'Pending QC', value: stats.panels_ready_for_qc, color: 'qaqc', icon: <Clock3 size={24} /> },
        { label: 'Approvals', value: stats.pending_approvals, color: stats.pending_approvals > 0 ? 'warning' : 'default', icon: <CheckCheck size={24} /> },
      ] : []}
    >
      <div className="dash-module">
        <section className="director-project-overview" aria-label="Live production overview">
          <header className="director-overview-bar">
            <div>
              <h2>Live Production Overview</h2>
              <p>{data.length} project{data.length === 1 ? '' : 's'} · KPI based only on completed assigned cables</p>
            </div>
            <div className="director-overview-actions">
              {updatedAt && <span>Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              <button type="button" onClick={() => void fetchData(true)} disabled={loading} aria-label="Refresh live production data">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </header>

          {loading && data.length === 0 && <div className="director-overview-empty">Loading live production…</div>}
          {!loading && data.length === 0 && <div className="director-overview-empty">No active projects are available.</div>}

          <div className="director-project-list">
            {data.map(({ project, panels }) => {
              const isOpen = expanded[project.code] ?? false;
              const projectKpi = assignedCableKpi(project.completedCables, project.totalCables);
              return (
                <article className={`director-project-card${isOpen ? ' is-expanded' : ''}`} key={project.code}>
                  <div className="director-project-header">
                    <button
                      type="button"
                      className="director-project-toggle"
                      onClick={() => setExpanded(current => ({ ...current, [project.code]: !isOpen }))}
                      aria-expanded={isOpen}
                      aria-controls={`director-panels-${project.code}`}
                    >
                      <span className="director-expand-icon">{isOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}</span>
                      <span className="director-project-identity">
                        <small>{project.code}</small>
                        <strong>{project.name}</strong>
                        <span>{project.client || 'DWES Project'} · {project.panelCount} panel{project.panelCount === 1 ? '' : 's'} · {project.panelsCompleted} completed</span>
                      </span>
                    </button>

                    <div className="director-project-summary" aria-label={`${project.name} overall summary`}>
                      <div className="director-project-status-block"><span>Overall status</span><StatusPill status={project.status} /></div>
                      <div className="director-project-progress-block">
                        <div><span>Overall progress</span><strong>{project.completedCables.toLocaleString()} / {project.totalCables.toLocaleString()}</strong></div>
                        <div className="director-project-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={projectKpi}>
                          <span style={{ width: `${projectKpi}%` }} />
                        </div>
                      </div>
                      <div className="director-project-kpi-block"><span>Overall KPI</span><KpiRing value={projectKpi} size="project" /></div>
                      <div className="director-project-hours-block">
                        <span>Active Hours</span>
                        <strong>{project.workingHours}</strong>
                      </div>
                      {/* Report downloads embed technician detail — ops/admin only. */}
                      {!isSales && (
                        <button
                          type="button"
                          className="director-project-download"
                          onClick={() => void downloadProjectReport(project)}
                          disabled={downloadingProject === project.code}
                        >
                          <Download size={16} />
                          {downloadingProject === project.code ? 'Preparing…' : 'PDF Report'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="director-panel-grid" id={`director-panels-${project.code}`}>
                      {panels.length === 0 && <div className="director-panel-empty">No assigned panels.</div>}
                      {panels.map(panel => {
                        const panelKpi = assignedCableKpi(panel.cablesCompleted, panel.cablesTotal);
                        return (
                          <section className="director-panel-card" key={panel.assignmentId}>
                            <div className="director-panel-card-head">
                              <div>
                                <small>Panel</small>
                                <h3 title={panel.panelName}>{panel.panelName}</h3>
                                <span title={panel.frameId}>{panel.frameId}</span>
                              </div>
                              <div className="director-panel-status"><span>Live status</span><StatusPill status={panel.status} /></div>
                            </div>

                            <div className="director-panel-performance">
                              <KpiRing value={panelKpi} />
                              <div className="director-panel-progress-wrap">
                                <div className="director-panel-progress-label"><span>Progress</span><strong>{displayPercent(panelKpi)}</strong></div>
                                <div className="director-panel-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={panelKpi}>
                                  <span style={{ width: `${panelKpi}%` }} />
                                </div>
                                <p>Completed assigned cables ÷ total assigned cables</p>
                              </div>
                            </div>

                            <div className="director-panel-cable-stats">
                              <CableMetric label="Assigned cables" value={panel.cablesTotal} />
                              <CableMetric label="Completed cables" value={panel.cablesCompleted} tone="completed" />
                              <CableMetric label="Remaining cables" value={panel.cablesRemaining} tone="remaining" />
                              <CableMetric label="Working Hours" value={panel.workingHours} />
                            </div>

                            <footer className="director-panel-actions">
                              {!isSales && (
                                <div className="director-panel-tech">
                                  <span>Technician:</span> {panel.technicianName}
                                </div>
                              )}
                              <button type="button" onClick={() => setLiveTarget({ project, panel })}>
                                <Eye size={16} /> Live
                              </button>
                              {!isSales && (
                                <button type="button" onClick={() => setReportTarget({ project, panel })}>
                                  <FileText size={16} /> PDF
                                </button>
                              )}
                            </footer>
                          </section>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {liveTarget && (() => {
            const liveKpi = assignedCableKpi(liveTarget.panel.cablesCompleted, liveTarget.panel.cablesTotal);
            return (
              <Modal
                title={liveTarget.panel.panelName}
                subtitle={`${liveTarget.project.name} · Live assigned-cable progress`}
                icon={<Activity />}
                onClose={() => setLiveTarget(null)}
                size="sm"
                footer={<button type="button" className="btn-primary" onClick={() => setLiveTarget(null)}>Close</button>}
              >
                <div className="director-live-modal">
                  <div className="director-live-modal-head">
                    <KpiRing value={liveKpi} size="project" />
                    <div><StatusPill status={liveTarget.panel.status} /><p>Live production status</p></div>
                  </div>
                  <div className="director-live-modal-progress"><span style={{ width: `${liveKpi}%` }} /></div>
                  <dl>
                    <div><dt>Assigned cables</dt><dd>{liveTarget.panel.cablesTotal}</dd></div>
                    <div><dt>Completed</dt><dd>{liveTarget.panel.cablesCompleted}</dd></div>
                    <div><dt>Remaining</dt><dd>{liveTarget.panel.cablesRemaining}</dd></div>
                    <div><dt>Working Hours</dt><dd>{liveTarget.panel.workingHours}</dd></div>
                    {!isSales && <div><dt>Assigned Tech</dt><dd>{liveTarget.panel.technicianName}</dd></div>}
                  </dl>
                </div>
              </Modal>
            );
          })()}

          {reportTarget && (
            <ReportPreviewModal
              assignmentId={reportTarget.panel.assignmentId}
              projectCode={reportTarget.project.code}
              frameId={reportTarget.panel.frameId}
              panelName={reportTarget.panel.panelName}
              onClose={() => setReportTarget(null)}
              showExport
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
