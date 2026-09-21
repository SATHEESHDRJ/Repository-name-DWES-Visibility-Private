import { useState, useEffect } from 'react';
import { CheckCheck, ClipboardCheck, FolderKanban, LayoutPanelTop, Users, UserRoundCog } from 'lucide-react';
import DashboardShell from '../../components/ui/DashboardShell';
import { projectsApi, supervisorApi } from '../../services/api';
import ProjectsTab from './tabs/ProjectsTab';
import FramesTab from './tabs/FramesTab';
import AssignmentTab from './tabs/AssignmentTab';
import ApprovalTab from './tabs/ApprovalTab';
import ReviewTab from './tabs/ReviewTab';
import UsersTab from './tabs/UsersTab';

const TABS = [
  { key: 'projects', label: 'Projects', icon: <FolderKanban size={18} /> },
  { key: 'frames', label: 'Frames & Upload', icon: <LayoutPanelTop size={18} /> },
  { key: 'assignments', label: 'Assignments', icon: <UserRoundCog size={18} /> },
  { key: 'approvals', label: 'Approvals', icon: <CheckCheck size={18} /> },
  { key: 'reports', label: 'Reports', icon: <ClipboardCheck size={18} /> },
  { key: 'user_mgmt', label: 'User Management', icon: <Users size={18} /> },
];

interface Stats {
  projects: number;
  assigned: number;
  pending: number;
  paused: number;
}

export default function SupervisorDashboard() {
  const [tab, setTab] = useState('projects');
  const [stats, setStats] = useState<Stats>({ projects: 0, assigned: 0, pending: 0, paused: 0 });

  useEffect(() => {
    Promise.all([
      projectsApi.list().catch(() => []),
      supervisorApi.allPanels().catch(() => []),
      supervisorApi.pendingApprovals().catch(() => []),
      supervisorApi.pendingChangeovers().catch(() => []),
    ]).then(([projs, panels, pending, paused]) => {
      setStats({
        projects: projs.length,
        assigned: panels.filter((panel: any) => panel.status !== 'completed').length,
        pending: pending.length,
        paused: paused.length,
      });
    });
  }, [tab]);

  const kpis = [
    { label: 'Projects', val: stats.projects, color: 'var(--status-progress)' },
    { label: 'Active', val: stats.assigned, color: 'var(--status-progress)' },
    { label: 'Approvals', val: stats.pending, color: 'var(--status-one-open)' },
    { label: 'Paused', val: stats.paused, color: 'var(--status-danger)' },
  ];

  return (
    <DashboardShell
      title="Production Supervisor"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
        subtitle="Manage projects, frames, technician assignment, approvals, and review workflows with tablet-optimized controls."
        badge="Supervisor Workspace"
        kpis={kpis.map(kpi => ({ label: kpi.label, value: kpi.val, color: kpi.color }))}
      >
        {tab === 'projects' && <ProjectsTab />}
        {tab === 'frames' && <FramesTab />}
        {tab === 'assignments' && <AssignmentTab />}
        {tab === 'approvals' && <ApprovalTab />}
        {tab === 'reports' && <ReviewTab />}
        {tab === 'user_mgmt' && <UsersTab />}
    </DashboardShell>
  );
}
