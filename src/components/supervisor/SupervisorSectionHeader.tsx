import type { ReactNode } from 'react';
import WorkspaceSectionHeading from '../ui/WorkspaceSectionHeading';

interface SupervisorSectionHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  icon?: ReactNode;
}

/** Supervisor workspace section header — shared WorkspaceSectionHeading with required icon. */
export default function SupervisorSectionHeader({
  title,
  description,
  actions,
  icon,
}: SupervisorSectionHeaderProps) {
  return (
    <WorkspaceSectionHeading
      title={title}
      subtitle={description || undefined}
      icon={icon}
      actions={actions}
    />
  );
}
