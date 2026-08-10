import { useState } from 'react';
import type { ReactNode } from 'react';
import DiagnosticsTab from './tabs/DiagnosticsTab';
import SyncTab from './tabs/SyncTab';
import DbConfigTab from './tabs/DbConfigTab';
import DeploymentModeTab from './tabs/DeploymentModeTab';
import TeamInstallLinkTab from './tabs/TeamInstallLinkTab';
import DeleteProjectTab from './tabs/DeleteProjectTab';
import HardResetDbTab from './tabs/HardResetDbTab';
import { DashboardIcon } from '../../components/ui/DashboardIcon';
import { UserManagementModal } from './UserManagementModal';

/**
 * System Settings — /admin/settings.
 *
 * Production ops surfaces only:
 *   User Management · Diagnostics · Deployment Mode · DB Config · Sync ·
 *   Danger Zone (Delete Project / Hard Reset DB).
 *
 * Orphan UI tabs (HardResetTab, ResetAllProjectsTab) are intentionally not
 * mounted — prefer hide over deleting backend endpoints. Re-enable only with
 * explicit ops approval.
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
        icon={<DashboardIcon name="diagnostics" size={17} />}
        title="System Overview"
        description="Application health, diagnostics, and user access."
      >
        <div className="dash-module dash-module--wide mb-3">
          <div className="flex flex-col sm:flex-row items-center justify-between p-3 gap-3 bg-slate-50 border border-slate-200 rounded-lg mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <DashboardIcon name="users" size={18} className="shrink-0" />
              <div className="min-w-0">
                <h4 className="text-[13px] font-bold text-primary m-0">User Management</h4>
                <p className="text-[11px] text-muted mt-0.5 m-0">Create accounts, change roles, reset passwords, and manage access.</p>
              </div>
            </div>
            <button type="button" className="btn-primary min-h-[44px]" onClick={() => setShowUsers(true)}>
              Manage Users
            </button>
          </div>
          <DiagnosticsTab />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<DashboardIcon name="settings" size={17} />}
        title="Configuration"
        description="Deployment mode and database connection."
      >
        <div className="admin-settings-duo">
          <DeploymentModeTab />
          <DbConfigTab />
        </div>
        <div className="mt-3">
          <TeamInstallLinkTab />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<DashboardIcon name="sync" size={17} />}
        title="Synchronization"
        description="Local/cloud sync status and history."
      >
        <SyncTab />
      </SettingsSection>

      <SettingsSection
        icon={<DashboardIcon name="danger" size={17} />}
        title="Danger Zone"
        description="Destructive maintenance — requires backup awareness."
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
