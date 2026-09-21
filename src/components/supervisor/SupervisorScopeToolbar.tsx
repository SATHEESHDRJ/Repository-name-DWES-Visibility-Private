import { CheckCircle, ShieldCheck } from '../ui/icons';
import ProjectPanelSelect from '../assignment/ProjectPanelSelect';
import type { Project } from '../../types';
import type { FramePanel } from '../assignment/ProjectPanelSelect';

interface SupervisorScopeToolbarProps {
  projects: Project[];
  selectedProjectCode: string;
  selectedPanelId: string;
  onProjectChange: (code: string) => void;
  onPanelChange: (panelId: string) => void;
  onPanelsLoaded: (panels: FramePanel[]) => void;
  panelsRefreshKey?: number;
  technicians?: any[];
  selectedTechId?: string;
  onTechChange?: (techId: string) => void;
  techSelectDisabled?: boolean;
  selectedPanel?: FramePanel;
  selectedPanelVerified?: boolean;
  showTechnicianFilter?: boolean;
  showVerificationChip?: boolean;
  selectedTechName?: string;
}

export default function SupervisorScopeToolbar({
  projects,
  selectedProjectCode,
  selectedPanelId,
  onProjectChange,
  onPanelChange,
  onPanelsLoaded,
  panelsRefreshKey = 0,
  technicians = [],
  selectedTechId = '',
  onTechChange,
  techSelectDisabled = false,
  selectedPanel,
  selectedPanelVerified = false,
  showTechnicianFilter = false,
  showVerificationChip = false,
  selectedTechName,
}: SupervisorScopeToolbarProps) {
  const verificationTone = !selectedPanel
    ? 'idle'
    : selectedPanelVerified
      ? 'ok'
      : 'warn';
  const verificationLabel = !selectedPanel
    ? 'Not selected'
    : selectedPanelVerified
      ? 'Verified'
      : 'Verification required';

  return (
    <section className="ops-toolbar-card" aria-label="Scope filters">
      <div className="ops-toolbar-row">
        <ProjectPanelSelect
          projects={projects}
          selectedProjectCode={selectedProjectCode}
          selectedPanelId={selectedPanelId}
          onProjectChange={onProjectChange}
          onPanelChange={onPanelChange}
          onPanelsLoaded={onPanelsLoaded}
          allowAllPanels
          refreshKey={panelsRefreshKey}
          layout="inline"
          className="ops-toolbar-selects"
        />

        {showTechnicianFilter && onTechChange && (
          <label
            className={`ops-toolbar-filter transition-opacity duration-200 ${
              techSelectDisabled ? 'opacity-50 pointer-events-none' : 'opacity-100'
            }`}
          >
            <span className="text-[13px] font-semibold text-muted">Technician</span>
            <select
              value={selectedTechId}
              onChange={e => onTechChange(e.target.value)}
              disabled={techSelectDisabled}
              className="form-select w-full min-w-[180px] disabled:cursor-not-allowed"
              aria-label="Filter by technician"
            >
              <option value="">All technicians</option>
              {technicians.map(t => (
                <option key={t.id} value={String(t.id)}>
                  {t.full_name} ({t.employee_id})
                </option>
              ))}
            </select>
          </label>
        )}

        {showVerificationChip && selectedPanel && (
          <div className="ops-toolbar-chip" role="status" aria-live="polite">
            <span className={`ops-context-pill ${verificationTone}`}>
              {verificationTone === 'ok' ? <CheckCircle size={14} /> : <ShieldCheck size={14} />}
              {verificationLabel}
            </span>
          </div>
        )}
      </div>

      {selectedTechName && (
        <p className="ops-toolbar-note">
          Filtering for <span className="font-semibold text-primary">{selectedTechName}</span>
        </p>
      )}
    </section>
  );
}
