import { useEffect, useState } from 'react';
import { Loader } from '../ui/icons';
import { projectsApi } from '../../services/api';
import type { Project } from '../../types';
import { isVerifiedFrame } from './frameUtils';

export interface FramePanel {
  id: string;
  panel_name: string;
  cable_count?: number;
  compare_status?: string;
  panel_type?: string | null;
  voltage_level?: string | null;
  system_type?: string | null;
  original_filename?: string;
  uploaded_at?: string;
  sheet_name?: string;
  [key: string]: unknown;
}

export interface ProjectPanelSelectProps {
  projects: Project[];
  selectedProjectCode: string;
  selectedPanelId: string;
  onProjectChange: (code: string) => void;
  onPanelChange: (panelId: string) => void;
  /** Include an "All panels" option (value "") — useful for list filters */
  allowAllPanels?: boolean;
  panelFilter?: (frame: FramePanel) => boolean;
  /** Split verified vs draft panels in the dropdown (assign flows) */
  groupByVerification?: boolean;
  layout?: 'inline' | 'stack';
  className?: string;
  projectLabel?: string;
  panelLabel?: string;
  disabled?: boolean;
  onPanelsLoaded?: (panels: FramePanel[]) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** Hide panel dropdown entirely (project-only contexts) */
  hidePanelSelect?: boolean;
  projectPlaceholder?: string;
  panelPlaceholder?: string;
  /** Increment to force a panel list reload (e.g. after verification) */
  refreshKey?: number;
}

export default function ProjectPanelSelect({
  projects,
  selectedProjectCode,
  selectedPanelId,
  onProjectChange,
  onPanelChange,
  allowAllPanels = false,
  panelFilter,
  groupByVerification = false,
  layout = 'inline',
  className = '',
  projectLabel = 'Project',
  panelLabel = 'Panel',
  disabled = false,
  onPanelsLoaded,
  onLoadingChange,
  hidePanelSelect = false,
  projectPlaceholder = 'Select project…',
  panelPlaceholder = 'Select panel…',
  refreshKey = 0,
}: ProjectPanelSelectProps) {
  const [panels, setPanels] = useState<FramePanel[]>([]);
  const [loadingPanels, setLoadingPanels] = useState(false);

  useEffect(() => {
    if (!selectedProjectCode) {
      setPanels([]);
      onPanelsLoaded?.([]);
      return;
    }

    let cancelled = false;
    setLoadingPanels(true);
    onLoadingChange?.(true);

    projectsApi.frames(selectedProjectCode)
      .then(data => {
        if (cancelled) return;
        const list = panelFilter ? (data as FramePanel[]).filter(panelFilter) : (data as FramePanel[]);
        setPanels(list);
        onPanelsLoaded?.(list);
      })
      .catch(() => {
        if (!cancelled) {
          setPanels([]);
          onPanelsLoaded?.([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPanels(false);
          onLoadingChange?.(false);
        }
      });

    return () => { cancelled = true; };
  }, [selectedProjectCode, panelFilter, onPanelsLoaded, onLoadingChange, refreshKey]);

  const handleProjectChange = (code: string) => {
    onProjectChange(code);
    onPanelChange('');
  };

  const verifiedPanels = groupByVerification ? panels.filter(isVerifiedFrame) : [];
  const draftPanels = groupByVerification ? panels.filter(f => !isVerifiedFrame(f)) : [];

  const panelDisabled = disabled || !selectedProjectCode || loadingPanels;
  const showPanelSelect = !hidePanelSelect;

  return (
    <div
      className={`project-panel-select ${layout === 'stack' ? 'flex flex-col gap-3' : 'flex flex-wrap items-end gap-3'} ${className}`}
      role="group"
      aria-label="Project and panel selection"
    >
      <label className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-initial sm:min-w-[200px]">
        <span className="text-[13px] font-semibold text-slate-600">{projectLabel}</span>
        <select
          value={selectedProjectCode}
          onChange={e => handleProjectChange(e.target.value)}
          disabled={disabled}
          className="form-select w-full"
          aria-label={projectLabel}
        >
          <option value="">{projectPlaceholder}</option>
          {projects.map(p => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </label>

      {showPanelSelect && (
        <label
          className={`flex flex-col gap-1 min-w-0 flex-1 sm:flex-initial sm:min-w-[200px] transition-opacity duration-200 ${
            selectedProjectCode ? 'opacity-100' : 'opacity-50 pointer-events-none'
          }`}
        >
          <span className="text-[13px] font-semibold text-slate-600 flex items-center gap-1.5">
            {panelLabel}
            {loadingPanels && <Loader size={14} className="text-slate-400" aria-hidden />}
          </span>
          <select
            value={selectedPanelId}
            onChange={e => onPanelChange(e.target.value)}
            disabled={panelDisabled}
            className="form-select w-full disabled:cursor-not-allowed"
            aria-label={panelLabel}
            aria-busy={loadingPanels}
          >
            {allowAllPanels && selectedProjectCode && !loadingPanels && (
              <option value="">All panels</option>
            )}
            {!allowAllPanels && (
              <option value="">{loadingPanels ? 'Loading panels…' : panelPlaceholder}</option>
            )}
            {groupByVerification ? (
              <>
                {verifiedPanels.length > 0 && (
                  <optgroup label="Verified (ready to assign)">
                    {verifiedPanels.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.panel_name} ({f.cable_count ?? 0} cables) ✓
                      </option>
                    ))}
                  </optgroup>
                )}
                {draftPanels.length > 0 && (
                  <optgroup label="Draft (verify first)">
                    {draftPanels.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.panel_name} ({f.cable_count ?? 0} cables) — not verified
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              panels.map(f => (
                <option key={f.id} value={f.id}>
                  {f.panel_name}{f.cable_count != null ? ` (${f.cable_count} cables)` : ''}
                </option>
              ))
            )}
          </select>
        </label>
      )}
    </div>
  );
}
