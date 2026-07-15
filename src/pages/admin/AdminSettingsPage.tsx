import { useState } from 'react';
import type { ReactNode } from 'react';
import DiagnosticsTab from './tabs/DiagnosticsTab';
import SyncTab from './tabs/SyncTab';
import DbConfigTab from './tabs/DbConfigTab';
import DeploymentModeTab from './tabs/DeploymentModeTab';
import DeleteProjectTab from './tabs/DeleteProjectTab';
import HardResetDbTab from './tabs/HardResetDbTab';
import { Activity, RefreshCw, Settings, TriangleAlert, Users } from '../../components/ui/icons';
import { UserManagementModal } from './UserManagementModal';

/**
 * System Settings — its own route (/admin/settings).
 * Single home for system status and operational diagnostics, organized into
 * clearly separated sections: Overview → Configuration → Synchronization →
 * Danger Zone. Each tab keeps its own API behaviour, confirmations, and RBAC.
 * Tabs that draw their own cards (Deployment, DB Config, Sync, Danger) are not
 * wrapped in an extra .dash-module to avoid card-in-card nesting.
 */

function SettingsSection({ icon, title, description, danger = false, children }: {
  icon: ReactNode;
  title: string;
  description: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`admin-settings-section${danger ? ' admin-settings-section--danger' : ''}`}>
      <header className="admin-settings-section-head">
        <span className="admin-settings-section-ico">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export default function AdminSettingsPage() {
  const [showUsers, setShowUsers] = useState(false);

  return (
    <div className="admin-settings-page">
      <SettingsSection
        icon={<Activity size={17} />}
        title="System Overview"
        description="Live application, backend, memory, database, and error status."
      >
        <div className="dash-module dash-module--wide mb-4">
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4 bg-indigo-50/50 border border-indigo-100 rounded-xl mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <Users size={20} />
              </div>
              <div>
                <h4 className="text-[14px] font-bold text-slate-800">User Management</h4>
                <p className="text-[12px] text-slate-600 mt-0.5">Create accounts, change roles, reset passwords, and manage access.</p>
              </div>
            </div>
            <button className="btn-primary" onClick={() => setShowUsers(true)}>
              Manage Users
            </button>
          </div>
          <DiagnosticsTab />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Settings size={17} />}
        title="Configuration"
        description="Deployment mode, database connection, and local file storage."
      >
        <div className="admin-settings-duo">
          <DeploymentModeTab />
          <DbConfigTab />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<RefreshCw size={17} />}
        title="Synchronization"
        description="Local and cloud data sync status, strategy, and history."
      >
        <SyncTab />
      </SettingsSection>

      <SettingsSection
        icon={<TriangleAlert size={17} />}
        title="Danger Zone"
        description="Destructive maintenance actions — cannot be undone without a backup."
        danger
      >
        <div className="admin-settings-duo">
          <DeleteProjectTab />
          <HardResetDbTab />
        </div>
      </SettingsSection>
      
      {showUsers && <UserManagementModal onClose={() => setShowUsers(false)} />}
    </div>
  );
}
