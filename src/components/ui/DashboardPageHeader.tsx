import type { ReactNode } from 'react';

export type DashboardHeaderBadgeVariant = 'blue' | 'gray' | 'amber' | 'red';

export interface DashboardPageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: DashboardHeaderBadgeVariant;
  aside?: ReactNode;
  live?: boolean;
  className?: string;
}

/**
 * Shared dashboard page header for all role dashboards
 * (Production Supervisor, Technician, QA/QC, Operations Director, System Administrator).
 * Sales Director is not a supported DWES role and must not be added.
 */
export default function DashboardPageHeader({
  title,
  subtitle,
  badge,
  badgeVariant = 'blue',
  aside,
  live = false,
  className = '',
}: DashboardPageHeaderProps) {
  return (
    <header
      className={`dashboard-page-header dashboard-hero page-heading glass-exempt${className ? ` ${className}` : ''}`}
      aria-labelledby="dashboard-page-header-title"
    >
      <div className="dashboard-page-header__body">
        <div className="dashboard-page-header__copy dashboard-hero-copy page-heading-copy">
          <div className="dashboard-page-header__title-wrap dashboard-hero-title-wrap">
            {live ? (
              <span
                className="tech-live-dot dashboard-hero-live-dot dashboard-page-header__live"
                data-live="true"
                title="Live activity"
                aria-label="Live activity"
              />
            ) : null}
            <h1
              id="dashboard-page-header-title"
              className="dashboard-page-header__title dashboard-hero-title page-heading-title section-title"
            >
              {title}
            </h1>
          </div>
          {subtitle ? (
            <p className="dashboard-page-header__subtitle dashboard-hero-subtitle page-heading-subtitle section-sub">
              {subtitle}
            </p>
          ) : null}
        </div>
        {(badge || aside) ? (
          <div className="dashboard-page-header__end dashboard-hero-aside page-heading-aside">
            {badge ? (
              <span
                className={`dashboard-page-header__badge badge badge-${badgeVariant} dashboard-hero-badge page-heading-badge`}
              >
                {badge}
              </span>
            ) : null}
            {aside ? (
              <div className="dashboard-page-header__aside-inner">
                {aside}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
