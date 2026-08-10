import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { DashboardIcon } from '../../components/ui/DashboardIcon';
import DashboardShell from '../../components/ui/DashboardShell';
import ReportPreviewModal from '../../components/ui/ReportPreviewModal';
import { useAuthStore } from '../../store/useAuthStore';
import { directorApi, supervisorApi } from '../../services/api';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { useDwesRefresh } from '../../hooks/useDwesRefresh';
import { DwesLoadingCenter } from '../../components/ui/DwesLoadingIndicator';
import { WorkspaceInfoHeader, isBlankInfoValue } from '../../components/ui/WorkspaceInfoMatrix';
import { compactPanelDisplayName } from '../../utils/projectDisplay';
import DirectorLiveSmartGrid, { type LiveProjectGroup } from './DirectorLiveSmartGrid';
import DirectorMonitoringPanel, { type DirectorMonitoringPayload } from './DirectorMonitoringPanel';

interface SubmittedPanelRow {
  panelName: string;
  frameId: string;
  assignmentId: number;
  submittedAt: string | null;
  submittedBy: string;
  client: string | null;
}

interface SubmittedProjectGroup {
  project: { code: string; name: string; client: string | null; location?: string | null };
  panels: SubmittedPanelRow[];
}

type DirectorTabKey = 'live_status' | 'submitted_panels' | 'monitoring';

const DIRECTOR_TABS = [
  {
    key: 'live_status' as const,
    label: 'Live Status',
    icon: <DashboardIcon name="status" size={20} />,
    description: 'Read-only live progress for all active projects and panels.',
  },
  {
    key: 'submitted_panels' as const,
    label: 'Submitted Panels',
    icon: <DashboardIcon name="history" size={20} />,
    description: 'Read-only register of project panels submitted for Operations review.',
  },
  {
    key: 'monitoring' as const,
    label: 'Monitoring',
    icon: <DashboardIcon name="diagnostics" size={20} />,
    description: 'Read-only project, panel and employee monitoring.',
  },
];

export default function DirectorDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<DirectorTabKey>('live_status');
  const [submittedData, setSubmittedData] = useState<SubmittedProjectGroup[]>([]);
  const [liveData, setLiveData] = useState<LiveProjectGroup[]>([]);
  const [loadingSubmitted, setLoadingSubmitted] = useState(true);
  const [loadingLive, setLoadingLive] = useState(true);
  const [monitoringData, setMonitoringData] = useState<DirectorMonitoringPayload | null>(null);
  const [loadingMonitoring, setLoadingMonitoring] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    project: SubmittedProjectGroup['project'];
    panel: SubmittedPanelRow;
  } | null>(null);
  const requests = useLatestRequest();
  // Stable refs so fetch callbacks do not recreate when payload state updates (avoids effect loops).
  const submittedLenRef = useRef(0);
  const liveLenRef = useRef(0);
  const monitoringDataRef = useRef<DirectorMonitoringPayload | null>(null);
  submittedLenRef.current = submittedData.length;
  liveLenRef.current = liveData.length;
  monitoringDataRef.current = monitoringData;

  const fetchSubmitted = useCallback(async (silent = false) => {
    const request = requests.begin();
    if (!silent && submittedLenRef.current === 0) setLoadingSubmitted(true);
    try {
      const result = await directorApi.projectsSummary(request.signal);
      if (!requests.isLatest(request.id)) return;
      setSubmittedData(Array.isArray(result) ? result : []);
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED' && requests.isLatest(request.id) && !silent && submittedLenRef.current === 0) {
        setSubmittedData([]);
      }
    } finally {
      if (requests.isLatest(request.id)) setLoadingSubmitted(false);
    }
  }, [requests]);

  const fetchLive = useCallback(async (silent = false) => {
    const request = requests.begin();
    if (!silent && liveLenRef.current === 0) setLoadingLive(true);
    try {
      const result = await supervisorApi.projectLiveSummary(request.signal);
      if (!requests.isLatest(request.id)) return;
      setLiveData(Array.isArray(result) ? result : []);
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED' && requests.isLatest(request.id) && !silent && liveLenRef.current === 0) {
        setLiveData([]);
      }
    } finally {
      if (requests.isLatest(request.id)) setLoadingLive(false);
    }
  }, [requests]);

  const fetchMonitoring = useCallback(async (silent = false) => {
    const request = requests.begin();
    const hasData = !!monitoringDataRef.current;
    if (!silent && !hasData) setLoadingMonitoring(true);
    try {
      const result = await directorApi.monitoring(request.signal);
      if (!requests.isLatest(request.id)) return;
      setMonitoringData(result || null);
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED' && requests.isLatest(request.id) && !silent && !monitoringDataRef.current) {
        setMonitoringData(null);
      }
    } finally {
      if (requests.isLatest(request.id)) setLoadingMonitoring(false);
    }
  }, [requests]);

  useEffect(() => {
    void fetchSubmitted(false);
    void fetchLive(false);
  }, [fetchSubmitted, fetchLive]);

  useEffect(() => {
    if (activeTab === 'monitoring') void fetchMonitoring(false);
  }, [activeTab, fetchMonitoring]);

  useDwesRefresh(() => {
    void fetchSubmitted(true);
    void fetchLive(true);
    if (activeTab === 'monitoring') void fetchMonitoring(true);
  });

  const totalSubmittedPanels = useMemo(
    () => submittedData.reduce((acc, group) => acc + group.panels.length, 0),
    [submittedData],
  );

  const totalLivePanels = useMemo(
    () => liveData.reduce((acc, group) => acc + group.panels.length, 0),
    [liveData],
  );

  const refreshActive = () => {
    if (activeTab === 'live_status') void fetchLive(true);
    else if (activeTab === 'monitoring') void fetchMonitoring(true);
    else void fetchSubmitted(true);
  };

  const shellSubtitle = activeTab === 'live_status'
    ? `${user?.full_name || ''} - Live project status (read-only)`
    : activeTab === 'monitoring'
      ? `${user?.full_name || ''} - Portfolio monitoring (read-only)`
      : `${user?.full_name || ''} - Submitted panel register (read-only)`;

  return (
    <DashboardShell
      title="Operations Director"
      subtitle={shellSubtitle}
      badge="Read Only"
      badgeVariant="gray"
      widthVariant="wide"
      tabs={[...DIRECTOR_TABS]}
      activeTab={activeTab}
      onTabChange={(key) => setActiveTab(key as DirectorTabKey)}
      hideTabSectionHeader
    >
      <div className="director-register-module director-register-layout">
        {activeTab === 'live_status' ? (
          <section className="director-submitted-register" aria-label="Live project status">
            <WorkspaceInfoHeader
              primary="Live Project Status"
              secondary={
                liveData.length === 0 && !loadingLive
                  ? 'No active projects found.'
                  : `${liveData.length} project${liveData.length === 1 ? '' : 's'}, ${totalLivePanels} panel${totalLivePanels === 1 ? '' : 's'}.`
              }
              trailing={(
                <button
                  type="button"
                  className="workspace-section-heading-refresh"
                  onClick={refreshActive}
                  disabled={loadingLive}
                  aria-label="Refresh live project status"
                >
                  <DashboardIcon name="refresh" size={14} className={loadingLive ? 'animate-spin' : ''} />
                </button>
              )}
            />

            {loadingLive && liveData.length === 0 && (
              <DwesLoadingCenter label="Loading live project status..." className="director-overview-empty" />
            )}
            {!loadingLive && liveData.length === 0 && (
              <div className="director-overview-empty">No active projects to display.</div>
            )}

            <DirectorLiveSmartGrid projects={liveData} />
          </section>
        ) : activeTab === 'monitoring' ? (
          <section className="director-submitted-register" aria-label="Portfolio monitoring">
            <WorkspaceInfoHeader
              primary="Monitoring"
              secondary="Read-only project, panel and employee monitoring."
              trailing={(
                <button
                  type="button"
                  className="workspace-section-heading-refresh"
                  onClick={refreshActive}
                  disabled={loadingMonitoring}
                  aria-label="Refresh monitoring"
                >
                  <DashboardIcon name="refresh" size={14} className={loadingMonitoring ? 'animate-spin' : ''} />
                </button>
              )}
            />
            <DirectorMonitoringPanel
              data={monitoringData}
              loading={loadingMonitoring}
              onRefresh={() => void fetchMonitoring(true)}
            />
          </section>
        ) : (
          <section className="director-submitted-register" aria-label="Submitted panels">
            <WorkspaceInfoHeader
              primary="Submitted Panels"
              secondary={
                totalSubmittedPanels === 0
                  ? 'No panels have been submitted yet.'
                  : `${totalSubmittedPanels} panel${totalSubmittedPanels === 1 ? '' : 's'} submitted.`
              }
              trailing={(
                <button
                  type="button"
                  className="workspace-section-heading-refresh"
                  onClick={refreshActive}
                  disabled={loadingSubmitted}
                  aria-label="Refresh submitted panels"
                >
                  <DashboardIcon name="refresh" size={14} className={loadingSubmitted ? 'animate-spin' : ''} />
                </button>
              )}
            />

            {loadingSubmitted && submittedData.length === 0 && (
              <DwesLoadingCenter label="Loading submitted panels..." className="director-overview-empty" />
            )}
            {!loadingSubmitted && submittedData.length === 0 && (
              <div className="director-overview-empty">No panels have been submitted yet.</div>
            )}

            <div className="director-project-stack">
              {submittedData.map(({ project, panels }) => (
                <article key={project.code} className="director-project-card">
                  <header className="director-project-card-head">
                    <div className="director-project-card-head-main min-w-0">
                      <h3 className="director-project-card-name">{project.name}</h3>
                      <div className="director-project-card-meta">
                        {!isBlankInfoValue(project.client) ? (
                          <div className="director-project-card-field">
                            <span className="director-project-card-field-label">Client</span>
                            <span className="director-project-card-field-value">{project.client}</span>
                          </div>
                        ) : null}
                        {!isBlankInfoValue(project.location) ? (
                          <div className="director-project-card-field">
                            <span className="director-project-card-field-label">Location</span>
                            <span className="director-project-card-field-value">{project.location}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <span className="director-project-card-badge">Submitted</span>
                  </header>
                  <ul className="director-panel-stack">
                    {panels.map(panel => (
                      <li key={panel.frameId} className="director-panel-item">
                        <strong className="director-panel-item-name" title={panel.panelName}>
                          {compactPanelDisplayName(panel.panelName)}
                        </strong>
                        <button
                          type="button"
                          className="director-submitted-view-btn dwes-report-action-btn"
                          disabled={!panel.assignmentId}
                          onClick={() => setReportTarget({ project, panel })}
                        >
                          View Report
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {reportTarget && reportTarget.panel.assignmentId > 0 ? (
        <ReportPreviewModal
          assignmentId={reportTarget.panel.assignmentId}
          projectCode={reportTarget.project.code}
          frameId={reportTarget.panel.frameId}
          panelName={reportTarget.panel.panelName}
          onClose={() => setReportTarget(null)}
          showExport
        />
      ) : null}
    </DashboardShell>
  );
}
