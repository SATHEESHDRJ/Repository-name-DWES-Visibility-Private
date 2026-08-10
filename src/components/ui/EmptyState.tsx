import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  variant?: 'default' | 'compact' | 'centered';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  variant = 'default',
}: EmptyStateProps) {
  const variantClasses = {
    default: 'empty-state',
    compact: 'empty-state-compact',
    centered: 'empty-state-centered',
  };

  return (
    <div
      className={`${variantClasses[variant]} ${className}`}
    >
      {icon && (
        <div
          className="empty-state-icon"
        >
          {icon}
        </div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {action && (
        <div
          className="empty-state-action"
        >
          {action}
        </div>
      )}
    </div>
  );
}

interface EmptyStateIllustrationProps {
  type: 'search' | 'filter' | 'error' | 'success' | 'no-data' | 'no-connection';
  className?: string;
}

export function EmptyStateIllustration({ type, className = '' }: EmptyStateIllustrationProps) {
  const illustrations: Record<string, ReactNode> = {
    search: (
      <svg
        className="empty-state-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="100" cy="100" r="80" fill="currentColor" fillOpacity="0.05" />
        <circle cx="100" cy="100" r="60" fill="currentColor" fillOpacity="0.1" />
        <circle cx="100" cy="100" r="40" fill="currentColor" fillOpacity="0.15" />
        <circle cx="100" cy="100" r="20" fill="currentColor" fillOpacity="0.2" />
      </svg>
    ),
    filter: (
      <svg
        className="empty-state-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="40" y="60" width="120" height="80" rx="8" fill="currentColor" fillOpacity="0.05" />
        <rect x="60" y="80" width="80" height="40" rx="4" fill="currentColor" fillOpacity="0.1" />
      </svg>
    ),
    error: (
      <svg
        className="empty-state-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="100" cy="100" r="70" fill="currentColor" fillOpacity="0.05" />
        <path d="M100 60 L100 100" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fillOpacity="0.2" />
        <circle cx="100" cy="130" r="8" fill="currentColor" fillOpacity="0.2" />
      </svg>
    ),
    success: (
      <svg
        className="empty-state-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="100" cy="100" r="70" fill="currentColor" fillOpacity="0.05" />
        <path
          d="M70 100 L90 120 L130 80"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fillOpacity="0.2"
        />
      </svg>
    ),
    'no-data': (
      <svg
        className="empty-state-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="50" y="50" width="100" height="100" rx="8" fill="currentColor" fillOpacity="0.05" />
        <line x1="50" y1="80" x2="150" y2="80" stroke="currentColor" strokeWidth="4" fillOpacity="0.1" />
        <line x1="50" y1="110" x2="150" y2="110" stroke="currentColor" strokeWidth="4" fillOpacity="0.1" />
        <line x1="50" y1="140" x2="150" y2="140" stroke="currentColor" strokeWidth="4" fillOpacity="0.1" />
      </svg>
    ),
    'no-connection': (
      <svg
        className="empty-state-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="100" cy="100" r="70" fill="currentColor" fillOpacity="0.05" />
        <line x1="60" y1="100" x2="140" y2="100" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fillOpacity="0.2" />
        <line x1="100" y1="60" x2="100" y2="140" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fillOpacity="0.2" />
      </svg>
    ),
  };

  return (
    <div
      className={`empty-state-illustration ${className}`}
    >
      {illustrations[type] || illustrations['no-data']}
    </div>
  );
}
