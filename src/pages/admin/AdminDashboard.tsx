import { Outlet, useNavigate } from 'react-router-dom';
import DashboardShell from '../../components/ui/DashboardShell';
import { DashboardIcon } from '../../components/ui/DashboardIcon';
import { useAuthStore } from '../../store/useAuthStore';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const activeTab = 'settings';
  const name = (user?.full_name || '').trim();
  const emp = (user?.employee_id || '').trim();
  const shellSubtitle = name && name.toLowerCase() !== 'system administrator'
    ? [name, emp].filter(Boolean).join(' · ')
    : emp || user?.username || '';

  return (
    <DashboardShell
      title="System Administrator"
      tabs={[{
        key: 'settings',
        label: 'System Settings',
        icon: <DashboardIcon name="settings" size={20} />,
        description: 'Users, diagnostics, configuration, sync, and authorised maintenance.',
      }]}
      activeTab={activeTab}
      onTabChange={() => navigate('/admin/settings')}
      subtitle={shellSubtitle}
      badge="Admin"
      widthVariant="wide"
      hideTabSectionHeader
    >
      <div className="admin-dashboard-content"><Outlet /></div>
    </DashboardShell>
  );
}
