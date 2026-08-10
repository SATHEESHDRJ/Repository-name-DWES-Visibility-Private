import type { ReactNode } from 'react';
import AppShell from '../layout/AppShell';
import PageContainer, { type PageContainerVariant } from '../layout/PageContainer';
import KpiCard from './KpiCard';
import PageHeading from './PageHeading';
import SectionHeader from './SectionHeader';
import type { NavItem } from '../layout/Topbar';

interface DashboardKpi {
  label: string;
  value: ReactNode;
  color?: string;
  icon?: ReactNode;
}

interface DashboardShellProps {
  title: string;
  subtitle: string;
  badge?: string;
  badgeVariant?: 'blue' | 'gray' | 'amber' | 'red';
  kpis?: DashboardKpi[];
  tabs?: NavItem[];
  sideNavItems?: NavItem[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** Centered readable column (default) or full-width for data-dense dashboards */
  widthVariant?: PageContainerVariant;
  /** Supervisor (and similar) render their own per-tab SectionHeader inside children. */
  hideTabSectionHeader?: boolean;
  /** Hide the dashboard hero title/subtitle block (rare — prefer heroAside instead). */
  hideHero?: boolean;
  /** Optional right column inside dashboard-hero (e.g. technician assigned date/time). */
  heroAside?: ReactNode;
  /** When true, shows a live-status dot beside the hero title (technician wiring in progress). */
  heroLive?: boolean;
  /** Optional extra class on the shared dashboard header (prefer shared styles). */
  heroClassName?: string;
  children: ReactNode;
}

function colorToVariant(color?: string): 'default' | 'green' | 'blue' | 'amber' | 'red' {
  if (!color) return 'default';
  if (color.includes('completed') || color.includes('success')) return 'green';
  if (color.includes('danger') || color.includes('error')) return 'red';
  if (color.includes('warning') || color.includes('one-open') || color.includes('pending')) return 'amber';
  if (color.includes('progress') || color.includes('source') || color.includes('qaqc')) return 'blue';
  return 'default';
}

export default function DashboardShell({
  title,
  subtitle,
  badge,
  badgeVariant = 'blue',
  kpis = [],
  tabs = [],
  activeTab,
  onTabChange,
  widthVariant = 'centered',
  hideTabSectionHeader = false,
  hideHero = false,
  heroAside,
  heroLive = false,
  heroClassName = '',
  sideNavItems = [],
  children,
}: DashboardShellProps) {
  const kpiGridClass = kpis.length >= 6 ? 'kpi-grid-6'
                     : kpis.length === 5 ? 'kpi-grid-5'
                     : 'kpi-grid';
  const activeNav = tabs.find(t => t.key === activeTab);

  return (
    <AppShell navItems={tabs} activeTab={activeTab} onTabChange={onTabChange} noPadding sideNavItems={sideNavItems}>
      <PageContainer variant={widthVariant} className="dashboard-shell-root flex flex-col gap-3">
        {!hideHero && (
          <PageHeading
            title={title}
            subtitle={subtitle}
            badge={badge}
            badgeVariant={badgeVariant}
            aside={heroAside}
            live={heroLive}
            className={heroClassName}
          />
        )}

        {kpis.length > 0 && (
          <div className={`bento-grid bento-grid--kpis ${kpiGridClass} dashboard-kpis`}>
            {kpis.map((kpi, i) => (
              <KpiCard
                key={i}
                label={kpi.label}
                value={kpi.value}
                variant={colorToVariant(kpi.color)}
                icon={kpi.icon}
              />
            ))}
          </div>
        )}

        <div className="dashboard-content flex flex-col gap-3 pb-4">
          {activeTab != null ? (
            <div key={hideTabSectionHeader ? undefined : activeTab} className="nav-tab-panel flex flex-col gap-3">
              {!hideTabSectionHeader && activeNav && (
                <SectionHeader
                  title={activeNav.label}
                  description={activeNav.description ?? subtitle}
                  icon={activeNav.icon}
                />
              )}
              {children}
            </div>
          ) : (
            <>
              {!hideTabSectionHeader && activeNav && (
                <SectionHeader
                  title={activeNav.label}
                  description={activeNav.description ?? subtitle}
                  icon={activeNav.icon}
                />
              )}
              {children}
            </>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}
