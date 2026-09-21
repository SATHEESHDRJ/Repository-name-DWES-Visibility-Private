import type { ReactNode } from 'react';
import Badge from '../Badge';

interface ProjectField {
  label: string;
  value: string | number | null | undefined;
}

interface ProjectInfoCardProps {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  fields: ProjectField[];
  actions?: ReactNode;
}

export default function ProjectInfoCard({ title, subtitle, statusLabel, fields, actions }: ProjectInfoCardProps) {
  return (
    <article className="project-card-premium">
      <div className="project-card-top">
        <div>
          <h3 className="project-card-title">{title}</h3>
          {subtitle && <p className="project-card-subtitle">{subtitle}</p>}
        </div>
        <div className="project-card-actions">
          {statusLabel && <Badge label={statusLabel} />}
          {actions}
        </div>
      </div>
      <div className="project-field-grid">
        {fields.map(field => (
          <div key={field.label} className="project-field">
            <div className="project-field-label">{field.label}</div>
            <div className="project-field-value">{field.value ?? '--'}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
