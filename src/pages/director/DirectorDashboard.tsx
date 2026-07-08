import { useEffect, useState } from 'react';
import {
  Activity, BarChart3, CheckCheck, Clock3, Download, FolderKanban, Users,
} from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import { directorApi } from '../../services/api';
import { useReadOnlyPoll } from '../../hooks/useReadOnlyPoll';
import SummaryReportTab from './tabs/SummaryReportTab';
import ExportTab from './tabs/ExportTab';
import ActivityTab from './tabs/ActivityTab';
import WorkforceTab from './tabs/WorkforceTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import UsersTab from '../supervisor/tabs/UsersTab';

const TABS = [
  { key: 'summary',   label: 'Project Summary', icon: <FolderKanban size={20} />, description: 'Enterprise project status, completion metrics, and portfolio overview.' },
  { key: 'analytics', label: 'KPI Analytics',   icon: <BarChart3 size={20} />, description: 'Trend analysis and performance indicators across active projects.' },
  { key: 'workforce', label: 'Workforce KPI',   icon: <Users size={20} />, description: 'Technician productivity, utilization, and assignment throughput.' },
  { key: 'users',     label: 'Users',           icon: <Users size={20} />, description: 'Read-only user directory — exact login usernames and role assignments.' },
  { key: 'activity',  label: 'Activity Log',    icon: <Activity size={20} />, description: 'Recent system events, submissions, and operational activity.' },
  { key: 'export',    label: 'Export',          icon: <Download size={20} />, description: 'Download reports and data exports for executive review.' },
];

export default function DirectorDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('summary');
  const [stats, setStats] = useState<any>(null);

  const loadStats = () => {
    directorApi.stats().then(setStats).catch(() => {});
  };

  useEffect(() => {
    loadStats();
  }, []);

  useReadOnlyPoll(loadStats, 4000);

  return (
    <DashboardShell
      title="Operations Director"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''} · Enterprise overview`}
      badge="Read Only"
      badgeVariant="gray"
      widthVariant="wide"
      kpis={stats ? [
        { label: 'Completed',  value: stats.panels_completed,    color: 'completed', icon: <CheckCheck size={24} /> },
        { label: 'Pending QC', value: stats.panels_ready_for_qc, color: 'qaqc',      icon: <Clock3 size={24} /> },
        { label: 'Approvals',  value: stats.pending_approvals,   color: stats.pending_approvals > 0 ? 'warning' : 'default', icon: <CheckCheck size={24} /> },
      ] : []}
    >
      {tab === 'summary' && <div className="dash-module"><SummaryReportTab /></div>}
      {tab === 'analytics' && <div className="dash-module"><AnalyticsTab /></div>}
      {tab === 'workforce' && <div className="dash-module"><WorkforceTab /></div>}
      {tab === 'users' && <div className="dash-module"><UsersTab /></div>}
      {tab === 'activity' && <div className="dash-module"><ActivityTab /></div>}
      {tab === 'export' && <div className="dash-module"><ExportTab stats={stats} /></div>}
    </DashboardShell>
  );
}
