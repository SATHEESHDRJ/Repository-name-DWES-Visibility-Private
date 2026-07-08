import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../../types';
import { AlertCircle, Building2, CheckCircle2, FolderOpen, MapPin, RefreshCw } from '../ui/icons';

interface ProjectSelectionModalProps {
  open: boolean;
  projects: Project[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onConfirm: (project: Project) => void;
}

export default function ProjectSelectionModal({
  open,
  projects,
  loading,
  error,
  onRetry,
  onConfirm,
}: ProjectSelectionModalProps) {
  const [selectedCode, setSelectedCode] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setSelectedCode('');
  }, [open]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.code === selectedCode) ?? null,
    [projects, selectedCode],
  );

  if (!open) return null;

  return (
    <div className="project-gate-overlay" role="presentation">
      <div className="project-gate-backdrop" />

      <section className="project-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="project-gate-title">
        <header className="project-gate-header">
          <p className="project-gate-kicker">Session Requirement</p>
          <h2 id="project-gate-title" className="project-gate-title">Select Active Project</h2>
          <p className="project-gate-subtitle">
            Project context is mandatory before modules, reports, and navigation are available.
          </p>
        </header>

        <div className="project-gate-body">
          {loading && (
            <div className="project-gate-state" aria-live="polite">
              <RefreshCw size={18} />
              <span>Loading available projects...</span>
            </div>
          )}

          {!loading && error && (
            <div className="project-gate-state project-gate-state--error" aria-live="assertive">
              <AlertCircle size={18} />
              <div>
                <p className="project-gate-error-title">Unable to load projects</p>
                <p className="project-gate-error-sub">{error}</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="project-gate-state project-gate-state--error" aria-live="polite">
              <AlertCircle size={18} />
              <div>
                <p className="project-gate-error-title">No projects available</p>
                <p className="project-gate-error-sub">Create a project first, then return to continue.</p>
              </div>
            </div>
          )}

          {!loading && !error && projects.length > 0 && (
            <div className="project-gate-list" aria-label="Available projects">
              {projects.map((project) => {
                const checked = selectedCode === project.code;
                return (
                  <button
                    key={project.code}
                    type="button"
                    className={`project-gate-item${checked ? ' is-selected' : ''}`}
                    onClick={() => setSelectedCode(project.code)}
                  >
                    <span className="project-gate-item-main">
                      <span className="project-gate-item-code">{project.code}</span>
                      <span className="project-gate-item-name">{project.name || project.code}</span>
                    </span>
                    <span className="project-gate-item-meta">
                      <span><Building2 size={14} /> {project.client || 'Client N/A'}</span>
                      <span><MapPin size={14} /> {String(project.project_state || 'not_started').replace(/_/g, ' ')}</span>
                      <span><FolderOpen size={14} /> {project.is_active ? 'Active' : 'Archived'}</span>
                    </span>
                    <span className="project-gate-item-check" aria-hidden="true">
                      <CheckCircle2 size={18} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="project-gate-footer">
          <p className="project-gate-footer-note">Single project selection only. Choice remains locked for this session.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => selectedProject && onConfirm(selectedProject)}
            disabled={!selectedProject || loading || Boolean(error)}
          >
            Continue with selected project
          </button>
        </footer>
      </section>
    </div>
  );
}
