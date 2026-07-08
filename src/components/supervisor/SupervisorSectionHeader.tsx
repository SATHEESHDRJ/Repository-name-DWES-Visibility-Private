import type { ReactNode } from 'react';
import SectionHeader from '../ui/SectionHeader';

interface SupervisorSectionHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  icon?: ReactNode;
}

/** Supervisor workspace section header — thin wrapper over the global SectionHeader. */
export default function SupervisorSectionHeader(props: SupervisorSectionHeaderProps) {
  return <SectionHeader {...props} />;
}
