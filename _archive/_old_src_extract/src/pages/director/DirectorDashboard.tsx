import { useState, useEffect } from 'react';
import { Activity, BarChart3, Download, FolderKanban, LayoutDashboard } from 'lucide-react';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import { directorApi } from '../../services/api';
import KPITab from './tabs/KPITab';
import ProjectsTab from './tabs/ProjectsTab';
import WorkforceTab from './tabs/WorkforceTab';
import ActivityTab from './tabs/ActivityTab';
import ExportTab from './tabs/ExportTab';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { key: 'projects', label: 'Projects', icon: <FolderKanban size={18} /> },
  { key: 'kpis', label: 'KPIs', icon: <BarChart3 size={18} /> },
  { key: 'analytics', label: 'Analytics', icon: <Activity size={18} /> },
  { key: 'reports', label: 'Reports', icon: <Download size={18} /> },
];

export default function DirectorDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingWorkforce, setLoadingWorkforce] = useState(false);

  useEffect(() => {
    directorApi.stats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    // Always load projects — needed for KPI charts even when on kpis tab
    if (projects.length === 0) {
      setLoadingProjects(true);
      directorApi.projects().then(d => { setProjects(d); setLoadingProjects(false); }).catch(() => setLoadingProjects(false));
    }
    if (tab === 'dashboard' && workforce.length === 0) {
      setLoadingWorkforce(true);
      directorApi.workforce().then(d => { setWorkforce(d); setLoadingWorkforce(false); }).catch(() => setLoadingWorkforce(false));
    }
  }, [tab, projects.length, workforce.length]);

  const compositeKpi = stats?.composite_kpi ?? 0;
  const kpiColor = compositeKpi >= 80 ? '#34d399' : compositeKpi >= 50 ? '#fbbf24' : '#f87171';

  return (
    <DashboardShell
      title="Operations Director"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
        subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''} · Real-time KPI dashboard`}
        badge="Director View"
        kpis={stats ? [
          { label: 'Composite KPI', value: `${compositeKpi}%`, color: kpiColor },
          { label: 'Projects', value: `${stats.projects_active}/${stats.projects_total}`, color: 'var(--status-progress)' },
          { label: 'In Progress', value: stats.panels_in_progress, color: 'var(--status-progress)' },
          { label: 'Completed', value: stats.panels_completed, color: 'var(--status-completed)' },
          { label: 'Pending QC', value: stats.panels_ready_for_qc, color: 'var(--role-admin)' },
          { label: 'Approvals', value: stats.pending_approvals, color: stats.pending_approvals > 0 ? 'var(--status-one-open)' : 'var(--text-soft)' },
        ] : []}
      >
        {tab === 'dashboard' && <WorkforceTab workforce={workforce} loading={loadingWorkforce} />}
        {tab === 'projects' && <ProjectsTab projects={projects} loading={loadingProjects} />}
        {tab === 'kpis' && <KPITab stats={stats} projects={projects} />}
        {tab === 'analytics' && <ActivityTab />}
        {tab === 'reports' && <ExportTab stats={stats} />}
    </DashboardShell>
  );
}
