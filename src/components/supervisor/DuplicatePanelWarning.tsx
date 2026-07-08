import { TriangleAlert, X } from '../ui/icons';
import {
  duplicatePanelBlockMessage,
  duplicatePanelRenameLabel,
  duplicatePanelSelectLabel,
  panelsWithDuplicateNames,
  uniquePanelsById,
} from '../../utils/panelDuplicates';
import { compactPanelDisplayName } from '../../utils/projectDisplay';
import type { FramePanel } from '../assignment/ProjectPanelSelect';

interface DuplicatePanelWarningProps {
  panels: FramePanel[];
  className?: string;
  /** Open edit flow for a duplicate panel (resolution path). */
  onEditPanel?: (panelId: string) => void;
  /** Set which duplicate panel is active — binds uploads/actions to internal ID. */
  onSelectPanel?: (panelId: string) => void;
  selectedPanelId?: string;
  /** Session-only dismiss — hides banner and unblocks UI for testing; does not change data. */
  onDismiss?: () => void;
}

/** Amber alert when a project contains panels with identical compact display tags. */
export default function DuplicatePanelWarning({
  panels,
  className = '',
  onEditPanel,
  onSelectPanel,
  selectedPanelId,
  onDismiss,
}: DuplicatePanelWarningProps) {
  const projectPanels = uniquePanelsById(panels);
  const duplicates = panelsWithDuplicateNames(projectPanels);
  if (duplicates.length === 0) return null;

  const uniqueNames = [...new Set(duplicates.map(p => compactPanelDisplayName(p.panel_name).trim()))];
  const primaryName = uniqueNames[0] ?? '';
  const bodyMessage = primaryName
    ? duplicatePanelBlockMessage(primaryName)
    : 'Duplicate panel names detected in this project.';

  const selectedDuplicateId = selectedPanelId && duplicates.some(d => d.id === selectedPanelId)
    ? selectedPanelId
    : '';

  return (
    <div
      className={`duplicate-panel-warning ${className}`.trim()}
      role="alert"
      aria-live="polite"
    >
      {onDismiss && (
        <button
          type="button"
          className="duplicate-panel-warning__clear"
          onClick={onDismiss}
          aria-label="Dismiss duplicate panel warning"
          title="Dismiss warning (session only — re-checks on next upload)"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      )}
      <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <p className="duplicate-panel-warning-title">Duplicate Panel Name Detected</p>
        <p className="duplicate-panel-warning-body">{bodyMessage}</p>
        {uniqueNames.length > 1 && (
          <p className="duplicate-panel-warning-body mt-1 text-[12px]">
            Conflicting tags:{' '}
            {uniqueNames.map((name, i) => (
              <span key={name}>
                {i > 0 && (i === uniqueNames.length - 1 ? ' and ' : ', ')}
                <strong className="duplicate-panel-warning-name">{name}</strong>
              </span>
            ))}
          </p>
        )}
        {(onEditPanel || onSelectPanel) && (
          <div className="duplicate-panel-warning-actions mt-3 flex flex-wrap items-center gap-2">
            {onEditPanel && duplicates.map(panel => (
              <button
                key={panel.id}
                type="button"
                className="btn-secondary !h-8 !px-3 !text-[12px] max-w-full truncate"
                title={duplicatePanelRenameLabel(panel)}
                onClick={() => onEditPanel(panel.id)}
              >
                {duplicatePanelRenameLabel(panel)}
              </button>
            ))}
            {onSelectPanel && duplicates.length > 1 && (
              <label className="flex items-center gap-2 text-[12px] text-slate-600 min-w-0">
                <span className="font-medium shrink-0">Set active duplicate panel:</span>
                <select
                  className="form-select !h-8 !py-0 !text-[12px] min-w-[200px] max-w-full"
                  value={selectedDuplicateId}
                  onChange={e => {
                    if (e.target.value) onSelectPanel(e.target.value);
                  }}
                  aria-label="Set active duplicate panel"
                >
                  <option value="">Choose duplicate…</option>
                  {duplicates.map(panel => (
                    <option key={panel.id} value={panel.id}>
                      {duplicatePanelSelectLabel(panel)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
