import DiagnosticsTab from './tabs/DiagnosticsTab';
import SyncTab from './tabs/SyncTab';
import DbConfigTab from './tabs/DbConfigTab';
import DeploymentModeTab from './tabs/DeploymentModeTab';
import DeleteProjectTab from './tabs/DeleteProjectTab';
import HardResetTab from './tabs/HardResetTab';
import ResetAllProjectsTab from './tabs/ResetAllProjectsTab';

/**
 * System Settings — its own route (/admin/settings).
 * Deployment mode, DB config, diagnostics, sync and destructive maintenance actions.
 */
export default function AdminSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="dash-module"><DeploymentModeTab /></div>
      <div className="dash-module"><DbConfigTab /></div>
      <div className="dash-module dash-module--wide"><DiagnosticsTab /></div>
      <div className="dash-module"><SyncTab /></div>
      <div className="dash-module"><DeleteProjectTab /></div>
      <div className="dash-module"><HardResetTab /></div>
      <div className="dash-module"><ResetAllProjectsTab /></div>
    </div>
  );
}
