import DiagnosticsTab from './tabs/DiagnosticsTab';
import SyncTab from './tabs/SyncTab';
import DbConfigTab from './tabs/DbConfigTab';
import DeploymentModeTab from './tabs/DeploymentModeTab';
import DeleteProjectTab from './tabs/DeleteProjectTab';
import HardResetDbTab from './tabs/HardResetDbTab';

/**
 * System Settings — its own route (/admin/settings).
 * Deployment mode, DB config, diagnostics, sync and destructive maintenance actions.
 */
export default function AdminSettingsPage() {
  return (
    <div className="bento-grid bento-grid--settings">
      <div className="dash-module bento-cell bento-cell--span-6"><DeploymentModeTab /></div>
      <div className="dash-module bento-cell bento-cell--span-6"><DbConfigTab /></div>
      <div className="dash-module dash-module--wide bento-cell bento-cell--span-12"><DiagnosticsTab /></div>
      <div className="dash-module bento-cell bento-cell--span-6"><SyncTab /></div>
      <div className="dash-module bento-cell bento-cell--span-6"><DeleteProjectTab /></div>
      <div className="dash-module bento-cell bento-cell--span-6"><HardResetDbTab /></div>
    </div>
  );
}
