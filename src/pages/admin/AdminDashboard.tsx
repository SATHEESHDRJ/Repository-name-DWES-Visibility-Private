import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Users } from '../../components/ui/icons';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';

// User Management + System Settings only. Logs & Audit admin page removed;
// backend audit recording (tech_audit_log) remains fully active.
// System-status KPIs intentionally live only inside System Settings
// (DiagnosticsTab) — the shell must not duplicate them above User Management.
const TABS = [
  { key: 'users',    label: 'User Management', icon: <Users size={20} />, description: 'Create, edit, reset passwords, and manage system users.' },
  { key: 'settings', label: 'System Settings', icon: <Settings size={20} />, description: 'Deployment mode, database, diagnostics, and system maintenance.' },
];

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = location.pathname.includes('/settings') ? 'settings' : 'users';

  return (
    <DashboardShell
      title="System Administrator"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(key) => navigate(`/admin/${key}`)}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}`}
      badge="Admin View"
      heroClassName="admin-dashboard-hero"
    >
      <div className="admin-dashboard-content"><Outlet /></div>
    </DashboardShell>
  );
}
