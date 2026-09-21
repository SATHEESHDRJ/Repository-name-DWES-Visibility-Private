import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from '../../components/ui/icons';
import { compactPanelDisplayName } from '../../utils/projectDisplay';
import { isBlankInfoValue } from '../../components/ui/WorkspaceInfoMatrix';

export interface LivePanelRow {
  panelId: string;
  panelName: string;
  totalCables: number;
  completedCables: number;
  remainingCables: number;
  progressPercentage: number;
  status: string;
  updatedAt: string | null;
}

export interface LiveProjectGroup {
  projectId: string;
  projectName: string;
  client: string | null;
  totalPanels: number;
  completedPanels: number;
  inProgressPanels: number;
  totalCables: number;
  completedCables: number;
  progressPercentage: number;
  panels: LivePanelRow[];
}

function formatLiveStatus(status: string): string {
  const labels: Record<string, string> = {
    unassigned: 'Unassigned',
    pending_approval: 'Pending approval',
    assigned: 'Assigned',
    in_progress: 'In progress',
    paused: 'Paused',
    completed: 'Completed',
    ready_for_qc: 'Ready for QC',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

function liveStatusClass(status: string): string {
  if (status === 'in_progress' || status === 'paused') return 'director-live-status--in-progress';
  if (status === 'completed' || status === 'ready_for_qc') return 'director-live-status--completed';
  return 'director-live-status--active';
}

export default function DirectorLiveSmartGrid({ projects }: { projects: LiveProjectGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpanded(new Set(projects.map(p => p.projectId)));
  }, [projects]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isOpen = (id: string) => expanded.has(id);

  return (
    <div className="director-project-overview director-project-list">
      {projects.map(project => {
        const open = isOpen(project.projectId);
        return (
          <article key={project.projectId} className={`director-project-card${open ? ' is-expanded' : ''}`}>
            <div className="director-project-header">
              <button
                type="button"
                className="director-project-toggle"
                aria-expanded={open}
                onClick={() => toggle(project.projectId)}
              >
                <span className="director-expand-icon" aria-hidden>
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
                <div className="director-project-identity">
                  <small>{project.projectId}</small>
                  <strong title={project.projectName}>{project.projectName}</strong>
                  <span>{!isBlankInfoValue(project.client) ? project.client : 'Client not set'}</span>
                </div>
              </button>
              <div className="director-project-summary">
                <div className="director-project-status-block">
                  <span>Status</span>
                  <span
                    className={`director-live-status ${project.inProgressPanels > 0 ? 'director-live-status--in-progress' : 'director-live-status--active'}`}
                  >
                    <span aria-hidden="true" />
                    {project.inProgressPanels > 0 ? 'In progress' : 'Active'}
                  </span>
                </div>
                <div className="director-project-progress-block">
                  <div>
                    <span>Overall progress</span>
                    <strong>{project.progressPercentage}%</strong>
                  </div>
                  <div className="director-project-progress" aria-hidden>
                    <span style={{ width: `${project.progressPercentage}%` }} />
                  </div>
                </div>
                <div className="director-project-kpi-block">
                  <span>Panels</span>
                  <strong>
                    {project.completedPanels}/{project.totalPanels}
                  </strong>
                </div>
              </div>
            </div>

            {open ? (
              <div className="director-panel-sections">
                <div className="director-panel-group">
                  <h4 className="director-panel-group-title">
                    Panel smart cards
                    <span>{project.panels.length}</span>
                  </h4>
                  <div className="director-panel-grid">
                    {project.panels.length === 0 ? (
                      <p className="director-panel-empty">No panels configured for this project.</p>
                    ) : (
                      project.panels.map(panel => (
                        <article key={panel.panelId} className="director-panel-card">
                          <header className="director-panel-card-head">
                            <div>
                              <small>Panel</small>
                              <h3 title={panel.panelName}>{compactPanelDisplayName(panel.panelName)}</h3>
                              <span>{panel.panelId}</span>
                            </div>
                            <div className="director-panel-status">
                              <span>Status</span>
                              <span className={`director-live-status ${liveStatusClass(panel.status)}`}>
                                <span aria-hidden="true" />
                                {formatLiveStatus(panel.status)}
                              </span>
                            </div>
                          </header>
                          <div className="director-panel-performance">
                            <div className="director-panel-progress-wrap">
                              <div className="director-panel-progress-label">
                                <span>Wiring progress</span>
                                <strong>{panel.progressPercentage}%</strong>
                              </div>
                              <div className="director-panel-progress" aria-hidden>
                                <span style={{ width: `${panel.progressPercentage}%` }} />
                              </div>
                              {panel.updatedAt ? (
                                <p>Updated {new Date(panel.updatedAt).toLocaleString()}</p>
                              ) : (
                                <p>Live production status</p>
                              )}
                            </div>
                          </div>
                          <div className="director-panel-cable-stats">
                            <div className="director-cable-metric">
                              <span>Total cables</span>
                              <strong>{panel.totalCables}</strong>
                            </div>
                            <div className="director-cable-metric" data-tone="completed">
                              <span>Completed</span>
                              <strong>{panel.completedCables}</strong>
                            </div>
                            <div className="director-cable-metric" data-tone="remaining">
                              <span>Remaining</span>
                              <strong>{panel.remainingCables}</strong>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
