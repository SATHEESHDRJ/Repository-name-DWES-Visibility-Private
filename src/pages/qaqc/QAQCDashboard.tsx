import { useState, useEffect } from 'react';
import { ClipboardCheck, ClipboardList, Clock3, CheckCheck, CircleX, TriangleAlert } from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import { qaqcApi } from '../../services/api';
import { useReadOnlyPoll } from '../../hooks/useReadOnlyPoll';
import PanelsTab from './tabs/PanelsTab';
import InspectionFormTab from './tabs/InspectionFormTab';
import HistoryTab from './tabs/HistoryTab';

// 'inspect' is intentionally absent from TABS — it is entered programmatically
// when the user selects a panel from Review Queue.
const TABS = [
  { key: 'review_queue', label: 'Review Queue',    icon: <ClipboardCheck size={20} />, description: 'Panels awaiting QA/QC inspection and sign-off.' },
  { key: 'completed',    label: 'Completed Panels', icon: <CheckCheck size={20} />, description: 'Inspection history and completed panel records.' },
  { key: 'reports',      label: 'Reports',          icon: <ClipboardList size={20} />, description: 'QC reports and inspection documentation.' },
];

export default function QAQCDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('review_queue');
  const [activePanel, setActivePanel] = useState<any | null>(null);
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, conditional: 0, ready_for_qc: 0 });

  const loadStats = () => {
    qaqcApi.stats().then(setStats).catch(() => {});
  };

  useEffect(() => { loadStats(); }, []);

  useReadOnlyPoll(loadStats, 4000);

  const handleSelectPanel = (p: any) => {
    setActivePanel(p);
    setTab('inspect');
  };

  const handleInspectionDone = () => {
    loadStats();
    setTab('completed');
  };

  const KPI_CARDS = [
    { label: 'Ready for QC', val: stats.ready_for_qc, color: 'var(--status-progress)', icon: <Clock3 size={24} /> },
    { label: 'Conditional',  val: stats.conditional,  color: 'var(--status-warning)',  icon: <TriangleAlert size={24} /> },
    { label: 'Failed',       val: stats.failed,       color: 'var(--status-danger)',   icon: <CircleX size={24} /> },
  ];

  return (
    <DashboardShell
      title="QA/QC Engineer"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}${activePanel && tab === 'inspect' ? ` · Inspecting: ${activePanel.panel_display_name || activePanel.panel_name}` : ''}`}
      badge="QAQC View"
      kpis={KPI_CARDS.map(card => ({ label: card.label, value: card.val, color: card.color, icon: card.icon }))}
    >
      {tab === 'review_queue' && <div className="dash-module"><PanelsTab onSelectPanel={handleSelectPanel} /></div>}
      {tab === 'inspect'      && <div className="dash-module"><InspectionFormTab panel={activePanel} onInspectionDone={handleInspectionDone} /></div>}
      {tab === 'completed'    && <div className="dash-module"><HistoryTab /></div>}
      {tab === 'reports'      && <div className="dash-module"><HistoryTab /></div>}
    </DashboardShell>
  );
}
