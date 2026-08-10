import type { ReactNode } from 'react';
import WorkspaceSectionHeading from './WorkspaceSectionHeading';

interface SectionHeaderProps {
  title: string;
  titleContent?: ReactNode;
  description: string;
  actions?: ReactNode;
  icon?: ReactNode;
}

/** App-wide tab section header — delegates to shared WorkspaceSectionHeading. */
export default function SectionHeader({
  title,
  titleContent,
  description,
  actions,
  icon,
}: SectionHeaderProps) {
  return (
    <WorkspaceSectionHeading
      title={title}
      titleContent={titleContent}
      subtitle={description || undefined}
      icon={icon}
      actions={actions}
    />
  );
}
