interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
}

/**
 * Lightweight page header aligned to shared dashboard header classes.
 * Role dashboards prefer DashboardShell → PageHeading → DashboardPageHeader.
 * Sales Director is not a supported DWES role and must not be added.
 */
export default function PageHeader({ title, subtitle, badge, actions }: PageHeaderProps) {
  return (
    <header className="page-header dashboard-page-header dashboard-hero page-heading glass-exempt mb-6">
      <div className="dashboard-page-header__body">
        <div className="page-header-copy dashboard-page-header__copy dashboard-hero-copy page-heading-copy">
          <div className="dashboard-page-header__title-wrap dashboard-hero-title-wrap">
            <h1 className="section-title dashboard-page-header__title dashboard-hero-title page-heading-title">
              {title}
            </h1>
          </div>
          {subtitle ? (
            <p className="section-sub dashboard-page-header__subtitle dashboard-hero-subtitle page-heading-subtitle">
              {subtitle}
            </p>
          ) : null}
        </div>
        {(badge || actions) ? (
          <div className="dashboard-page-header__end page-header-actions">
            {badge ? (
              <span className="badge badge-blue dashboard-page-header__badge dashboard-hero-badge page-heading-badge">
                {badge}
              </span>
            ) : null}
            {actions ? <div className="dashboard-page-header__aside-inner shrink-0">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
