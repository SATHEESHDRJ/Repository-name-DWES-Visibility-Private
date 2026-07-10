interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, badge, actions }: PageHeaderProps) {
  return (
    <div className="page-header mb-6 flex items-start justify-between gap-4">
      <div className="page-header-copy min-w-0 flex-1">
        <div className="dashboard-hero-title-row">
          <div className="dashboard-hero-title-wrap">
            <h1 className="section-title dashboard-hero-title">{title}</h1>
          </div>
          {badge ? (
            <span className="badge badge-blue dashboard-hero-badge">{badge}</span>
          ) : null}
        </div>
        {subtitle ? <p className="section-sub dashboard-hero-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions shrink-0">{actions}</div> : null}
    </div>
  );
}
