import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Database,
  FolderKanban,
  Settings,
  TriangleAlert,
  UserCog,
  Users,
} from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';
import { adminApi } from '../../services/api';

// User Management + System Settings only. Logs & Audit admin page removed;
// backend audit recording (tech_audit_log) remains fully active.
const TABS = [
  { key: 'users',    label: 'User Management', icon: <Users size={20} />, description: 'Create, edit, reset passwords, and manage system users.' },
  { key: 'settings', label: 'System Settings', icon: <Settings size={20} />, description: 'Deployment mode, database, diagnostics, and system maintenance.' },
];

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [diag, setDiag] = useState<any>(null);

  useEffect(() => {
    adminApi.diagnostics().then(setDiag).catch(() => {});
  }, []);

  const activeTab = location.pathname.includes('/settings') ? 'settings' : 'users';
  const heapPct = diag?.memory?.heap_pct ?? 0;

  return (
    <DashboardShell
      title="System Administrator"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(key) => navigate(`/admin/${key}`)}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}`}
      badge="Admin View"
      kpis={diag ? [
        { label: 'Uptime',       value: diag.system.uptime_human,      color: 'completed', icon: <Activity size={24} /> },
        { label: 'Heap',         value: `${heapPct}%`,                  color: heapPct > 80 ? 'danger' : heapPct > 60 ? 'warning' : 'completed', icon: <Database size={24} /> },
        { label: 'Users',        value: diag.database.users,            color: 'progress',  icon: <Users size={24} /> },
        { label: 'Projects',     value: diag.database.projects,         color: 'progress',  icon: <FolderKanban size={24} /> },
        { label: 'Assignments',  value: diag.database.assignments,      color: 'default',   icon: <UserCog size={24} /> },
        { label: 'Errors',       value: diag.recent_errors.length,      color: diag.recent_errors.length > 0 ? 'danger' : 'completed', icon: <TriangleAlert size={24} /> },
      ] : []}
    >
      <Outlet />
    </DashboardShell>
  );
}
