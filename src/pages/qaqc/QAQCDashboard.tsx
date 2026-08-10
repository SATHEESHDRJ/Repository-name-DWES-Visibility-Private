import { useCallback, useEffect, useState } from 'react';
import { DashboardIcon } from '../../components/ui/DashboardIcon';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import { qaqcApi } from '../../services/api';
import { useDwesRefresh, type RefreshOptions } from '../../hooks/useDwesRefresh';
import PanelsTab from './tabs/PanelsTab';
import InspectionFormTab from './tabs/InspectionFormTab';
import HistoryTab from './tabs/HistoryTab';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { onFramesChanged } from '../../utils/projectFramesEvents';

/**
 * QA/QC interim flow (tablet roadmap Phase 5):
 *   Review Queue → panel → Inspection Form (PASS / FAIL / Conditional)
 *   → History / Reports (merged; was duplicate Completed + Reports tabs).
 */
const TABS = [
  {
    key: 'review_queue',
    label: 'Review Queue',
    icon: <DashboardIcon name="review_queue" size={20} />,
    description: 'Panels awaiting QA/QC inspection and sign-off.',
  },
  {
    key: 'history',
    label: 'History / Reports',
    icon: <DashboardIcon name="history" size={20} />,
    description: 'Inspection history and QC reports (interim).',
  },
];

export default function QAQCDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('review_queue');
  const [activePanel, setActivePanel] = useState<any | null>(null);
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, conditional: 0, ready_for_qc: 0 });
  const statsRequests = useLatestRequest();

  const loadStats = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = statsRequests.begin();
    // Never zero the KPI tiles on a background refresh — the new values swap in place.
    if (!silent) setStats({ total: 0, passed: 0, failed: 0, conditional: 0, ready_for_qc: 0 });
    try {
      const next = await qaqcApi.stats(request.signal);
      if (statsRequests.isLatest(request.id)) setStats(next);
    } catch { /* zero loading state remains until the next authoritative read */ }
  }, [statsRequests]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  useDwesRefresh(loadStats);

  const closeUnavailablePanel = useCallback(() => {
    setActivePanel(null);
    setTab('review_queue');
  }, []);

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted' || !activePanel) return;
    if (activePanel.project_code === detail.projectCode
      && (!detail.frameId || activePanel.frame_id === detail.frameId)) {
      closeUnavailablePanel();
    }
  }), [activePanel, closeUnavailablePanel]);

  const handleSelectPanel = (p: any) => {
    setActivePanel(p);
    setTab('inspect');
  };

  const handleInspectionDone = () => {
    void loadStats({ silent: true });
    setTab('history');
  };

  const KPI_CARDS = [
    { label: 'Ready for QC', val: stats.ready_for_qc, color: 'var(--status-progress)', icon: <DashboardIcon name="ready_qc" size={18} /> },
    { label: 'Conditional',  val: stats.conditional,  color: 'var(--status-warning)',  icon: <DashboardIcon name="conditional" size={18} /> },
    { label: 'Failed',       val: stats.failed,       color: 'var(--status-danger)',   icon: <DashboardIcon name="failed" size={18} /> },
  ];

  return (
    <DashboardShell
      title="QA/QC"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''} · QA/QC workflow under development${activePanel && tab === 'inspect' ? ` · Inspecting: ${activePanel.panel_display_name || activePanel.panel_name}` : ''}`}
      badge="Under Development"
      kpis={KPI_CARDS.map(card => ({ label: card.label, value: card.val, color: card.color, icon: card.icon }))}
      widthVariant="wide"
      hideTabSectionHeader={tab === 'inspect'}
    >
      {tab === 'review_queue' && <div className="dash-module"><PanelsTab onSelectPanel={handleSelectPanel} /></div>}
      {tab === 'inspect' && (
        <div className="dash-module">
          <InspectionFormTab panel={activePanel} onInspectionDone={handleInspectionDone} onUnavailable={closeUnavailablePanel} />
        </div>
      )}
      {tab === 'history' && <div className="dash-module"><HistoryTab /></div>}
      {/* Legacy tab keys (completed / reports) redirect to merged History / Reports */}
      {(tab === 'completed' || tab === 'reports') && <div className="dash-module"><HistoryTab /></div>}
    </DashboardShell>
  );
}
