import type { ReactNode } from 'react';
import DiagnosticsTab from './tabs/DiagnosticsTab';
import SyncTab from './tabs/SyncTab';
import DbConfigTab from './tabs/DbConfigTab';
import DeploymentModeTab from './tabs/DeploymentModeTab';
import DeleteProjectTab from './tabs/DeleteProjectTab';
import HardResetDbTab from './tabs/HardResetDbTab';
import { Activity, RefreshCw, Settings, TriangleAlert } from '../../components/ui/icons';

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
  return (
    <div className="admin-settings-page">
      <SettingsSection
        icon={<Activity size={17} />}
        title="System Overview"
        description="Live application, backend, memory, database, and error status."
      >
        <div className="dash-module dash-module--wide"><DiagnosticsTab /></div>
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
    </div>
  );
}
