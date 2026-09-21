import { useState, useEffect } from 'react';
import { ActivitySquare, ClipboardCheck, CloudUpload, FolderKanban, LayoutPanelTop, ScrollText, Settings, ShieldCheck, UsersRound, UserRoundCog } from 'lucide-react';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import { adminApi } from '../../services/api';
import DiagnosticsTab from './tabs/DiagnosticsTab';
import UserMgmtTab from './tabs/UserMgmtTab';
import SyncTab from './tabs/SyncTab';
import SessionsTab from './tabs/SessionsTab';
import ProjectsTab from '../supervisor/tabs/ProjectsTab';
import FramesTab from '../supervisor/tabs/FramesTab';
import AssignmentTab from '../supervisor/tabs/AssignmentTab';
import ReviewTab from '../supervisor/tabs/ReviewTab';
import HistoryTab from '../qaqc/tabs/HistoryTab';
import ActivityTab from '../director/tabs/ActivityTab';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: <ActivitySquare size={18} /> },
  { key: 'projects', label: 'Projects', icon: <FolderKanban size={18} /> },
  { key: 'frames', label: 'Frames & Upload', icon: <LayoutPanelTop size={18} /> },
  { key: 'assignments', label: 'Assignments', icon: <UserRoundCog size={18} /> },
  { key: 'user_mgmt', label: 'User Management', icon: <UsersRound size={18} /> },
  { key: 'qaqc', label: 'QA/QC', icon: <ClipboardCheck size={18} /> },
  { key: 'reports', label: 'Reports', icon: <ScrollText size={18} /> },
  { key: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  { key: 'diagnostics', label: 'Diagnostics', icon: <ActivitySquare size={18} /> },
  { key: 'audit_logs', label: 'Audit Logs', icon: <CloudUpload size={18} /> },
  { key: 'sessions', label: 'Sessions', icon: <ShieldCheck size={18} /> },
];

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('dashboard');
  const [diag, setDiag] = useState<any>(null);

  useEffect(() => {
    adminApi.diagnostics().then(setDiag).catch(() => {});
  }, []);

  const heapPct = diag?.memory?.heap_pct ?? 0;
  const heapColor = heapPct > 80 ? '#f87171' : heapPct > 60 ? '#fbbf24' : '#34d399';

  return (
    <DashboardShell
      title="System Administrator"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
        subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}`}
        badge="Admin View"
        kpis={diag ? [
          { label: 'Uptime', value: diag.system.uptime_human, color: 'var(--status-completed)' },
          { label: 'Heap', value: `${heapPct}%`, color: heapColor },
          { label: 'Users', value: diag.database.users, color: 'var(--status-progress)' },
          { label: 'Projects', value: diag.database.projects, color: 'var(--status-progress)' },
          { label: 'Assignments', value: diag.database.assignments, color: 'var(--text-soft)' },
          { label: 'Errors', value: diag.recent_errors.length, color: diag.recent_errors.length > 0 ? 'var(--status-danger)' : 'var(--text-soft)' },
        ] : []}
      >
        {tab === 'dashboard' && <DiagnosticsTab />}
        {tab === 'projects' && <ProjectsTab />}
        {tab === 'frames' && <FramesTab />}
        {tab === 'assignments' && <AssignmentTab />}
        {tab === 'user_mgmt' && <UserMgmtTab />}
        {tab === 'qaqc' && <HistoryTab />}
        {tab === 'reports' && <ReviewTab />}
        {tab === 'settings' && <SyncTab />}
        {tab === 'diagnostics' && <DiagnosticsTab />}
        {tab === 'audit_logs' && <ActivityTab />}
        {tab === 'sessions' && <SessionsTab />}
    </DashboardShell>
  );
}
