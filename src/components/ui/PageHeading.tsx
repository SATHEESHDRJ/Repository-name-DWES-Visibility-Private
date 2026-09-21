import DashboardPageHeader, { type DashboardPageHeaderProps } from './DashboardPageHeader';

export type { DashboardHeaderBadgeVariant, DashboardPageHeaderProps } from './DashboardPageHeader';

/** Stable import path used by DashboardShell. */
export default function PageHeading(props: DashboardPageHeaderProps) {
  return <DashboardPageHeader {...props} />;
}