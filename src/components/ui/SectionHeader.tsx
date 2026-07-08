import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  icon?: ReactNode;
}

/** App-wide section header — modern accent treatment used across all role dashboards. */
export default function SectionHeader({
  title,
  description,
  actions,
  icon,
}: SectionHeaderProps) {
  return (
    <header className="app-section-header">
      <div className="app-section-header-accent" aria-hidden />
      <div className="app-section-header-body">
        <div className="app-section-header-text min-w-0">
          <div className="app-section-title-row">
            {icon ? <span className="app-section-icon">{icon}</span> : null}
            <h2 className="app-section-title">{title}</h2>
          </div>
          <p className="app-section-desc">{description}</p>
        </div>
        {actions ? (
          <div className="app-section-header-actions shrink-0">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
