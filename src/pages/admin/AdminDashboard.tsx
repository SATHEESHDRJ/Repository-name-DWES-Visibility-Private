import { Outlet, useNavigate } from 'react-router-dom';
import DashboardShell from '../../components/ui/DashboardShell';
import { DashboardIcon } from '../../components/ui/DashboardIcon';
import { useAuthStore } from '../../store/useAuthStore';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const activeTab = 'settings';

  return (
    <DashboardShell
      title="System Administrator"
      tabs={[{
        key: 'settings',
        label: 'System Settings',
        icon: <DashboardIcon name="settings" size={20} />,
        description: 'Manage users, security, and system configuration.',
      }]}
      activeTab={activeTab}
      onTabChange={() => navigate('/admin/settings')}
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}`}
      badge="Admin View"
      widthVariant="wide"
    >
      <div className="admin-dashboard-content"><Outlet /></div>
    </DashboardShell>
  );
}
