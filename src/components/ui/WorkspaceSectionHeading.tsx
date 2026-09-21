import type { ReactNode } from 'react';

interface WorkspaceSectionHeadingProps {
  title: string;
  /** When set, rendered inside the title element (use `title` for tooltip / a11y). */
  titleContent?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** primary = standard workspace card header; secondary = the denser equivalent. */
  variant?: 'primary' | 'secondary';
  /** Optional short subtitle shown under the title (muted, small). */
  subtitle?: string;
}

/**
 * Shared workspace/card header for all role dashboards
 * (Supervisor, Technician, QA/QC, Operations Director, System Administrator).
 */
export default function WorkspaceSectionHeading({
  title,
  titleContent,
  icon,
  actions,
  className = '',
  variant = 'primary',
  subtitle,
}: WorkspaceSectionHeadingProps) {
  const variantClass = variant === 'secondary'
    ? ' workspace-section-heading--secondary'
    : ' workspace-section-heading--primary';
  return (
    <header className={`workspace-section-heading${variantClass}${className ? ` ${className}` : ''}`}>
      <div className="workspace-section-heading-main">
        {icon ? <span className="workspace-section-heading-icon" aria-hidden>{icon}</span> : null}
        <div className="workspace-section-heading-text min-w-0">
          <h3 className="workspace-section-heading-title" title={title}>
            {titleContent ?? title}
          </h3>
          {subtitle ? <p className="workspace-section-heading-sub">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="workspace-section-heading-actions">{actions}</div> : null}
    </header>
  );
}
