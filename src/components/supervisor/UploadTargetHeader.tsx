import { FolderKanban, LayoutGrid } from '../ui/icons';

interface UploadTargetHeaderProps {
  projectName: string;
  projectCode?: string;
  panelName: string;
  /** Internal frame/panel ID — shown so supervisors can verify the correct panel when names duplicate. */
  panelId?: string;
  kind?: 'wiring' | 'drawing';
}

/** Prominent project + panel identity block for supervisor upload dialogs. */
export default function UploadTargetHeader({
  projectName,
  projectCode,
  panelName,
  panelId,
  kind = 'wiring',
}: UploadTargetHeaderProps) {
  const kindLabel = kind === 'drawing' ? 'Drawing upload target' : 'Wiring schedule target';

  return (
    <header className="upload-target-header" aria-label={`${kindLabel}: ${projectName}, ${panelName}`}>
      <p className="upload-target-header-eyebrow">{kindLabel}</p>
      <div className="upload-target-header-grid">
        <div className="upload-target-header-block">
          <span className="upload-target-header-label">
            <FolderKanban size={14} strokeWidth={1.75} aria-hidden />
            Project
          </span>
          <p className="upload-target-header-value" title={projectName}>{projectName}</p>
          {projectCode && (
            <p className="upload-target-header-meta font-mono">{projectCode}</p>
          )}
        </div>
        <div className="upload-target-header-divider" aria-hidden />
        <div className="upload-target-header-block upload-target-header-block--panel">
          <span className="upload-target-header-label">
            <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />
            Panel / Subpanel
          </span>
          <p className="upload-target-header-value upload-target-header-value--panel" title={panelName}>
            {panelName}
          </p>
          {panelId && (
            <p className="upload-target-header-meta font-mono" title="Internal panel ID">
              ID: {panelId}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
