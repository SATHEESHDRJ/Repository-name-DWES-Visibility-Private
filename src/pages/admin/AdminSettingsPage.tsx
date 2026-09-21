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
import AdminHealthStrip from './AdminHealthStrip';

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
      <AdminHealthStrip />

      <SettingsSection
        icon={<DashboardIcon name="users" size={17} />}
        title="Users and roles"
        description="Active accounts, technician availability, project access, and assignment integrity."
      >
        <div className="admin-users-cta">
          <div className="admin-users-cta-copy">
            <h4>User Management</h4>
            <p>Create accounts, change roles, reset passwords, activate/disable users, and manage access. Destructive changes use confirmation dialogs and write audit records.</p>
          </div>
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => setShowUsers(true)}>
            Manage Users
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<DashboardIcon name="diagnostics" size={17} />}
        title="Application / service status"
        description="SSE/API/database health, failed jobs, processing alerts, and diagnostics."
      >
        <DiagnosticsTab />
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
        description="Destructive maintenance — requires backup awareness and confirmation."
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
