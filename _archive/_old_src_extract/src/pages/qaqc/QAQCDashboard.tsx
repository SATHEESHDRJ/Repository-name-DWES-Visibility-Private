import { useState, useEffect } from 'react';
import { ClipboardList, ListChecks, ScanSearch } from 'lucide-react';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import { qaqcApi } from '../../services/api';
import PanelsTab from './tabs/PanelsTab';
import InspectionFormTab from './tabs/InspectionFormTab';
import HistoryTab from './tabs/HistoryTab';

const TABS = [
  { key: 'assigned_projects', label: 'Assigned Projects', icon: <ListChecks size={18} /> },
  { key: 'inspections', label: 'Inspections', icon: <ScanSearch size={18} /> },
  { key: 'qaqc', label: 'QA/QC', icon: <ScanSearch size={18} /> },
  { key: 'reports', label: 'Reports', icon: <ClipboardList size={18} /> },
];

export default function QAQCDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('assigned_projects');
  const [activePanel, setActivePanel] = useState<any | null>(null);
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, conditional: 0, ready_for_qc: 0 });

  const loadStats = () => {
    qaqcApi.stats().then(setStats).catch(() => {});
  };

  useEffect(() => { loadStats(); }, []);

  const handleSelectPanel = (p: any) => {
    setActivePanel(p);
    setTab('inspections');
  };

  const handleInspectionDone = () => {
    loadStats();
  };

  const KPI_CARDS = [
    { label: 'Ready for QC', val: stats.ready_for_qc, color: '#38bdf8' },
    { label: 'Inspected', val: stats.total, color: '#94a3b8' },
    { label: 'Passed', val: stats.passed, color: '#34d399' },
    { label: 'Conditional', val: stats.conditional, color: '#fbbf24' },
    { label: 'Failed', val: stats.failed, color: '#f87171' },
  ];

  return (
    <DashboardShell
      title="QA/QC Engineer"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
        subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}${activePanel && tab === 'inspect' ? ` · Inspecting: ${activePanel.panel_display_name || activePanel.panel_name}` : ''}`}
        badge="QAQC View"
        kpis={KPI_CARDS.map(card => ({ label: card.label, value: card.val, color: card.color }))}
      >
        {tab === 'assigned_projects' && <PanelsTab onSelectPanel={handleSelectPanel} />}
        {tab === 'inspections' && <InspectionFormTab panel={activePanel} onInspectionDone={handleInspectionDone} />}
        {tab === 'qaqc' && <PanelsTab onSelectPanel={handleSelectPanel} />}
        {tab === 'reports' && <HistoryTab />}
    </DashboardShell>
  );
}
