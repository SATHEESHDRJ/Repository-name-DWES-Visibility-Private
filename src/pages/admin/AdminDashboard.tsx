import { Outlet } from 'react-router-dom';
import DashboardShell from '../../components/ui/DashboardShell';
import { useAuthStore } from '../../store/useAuthStore';

export default function AdminDashboard() {
  const { user } = useAuthStore();

  return (
    <DashboardShell
      title="System Administrator"
      subtitle={`${user?.full_name || ''} · ${user?.employee_id || ''}`}
      badge="Admin View"
      heroClassName="admin-dashboard-hero"
    >
      <div className="admin-dashboard-content"><Outlet /></div>
    </DashboardShell>
  );
}
