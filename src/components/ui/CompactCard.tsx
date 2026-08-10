import type { ReactNode } from 'react';

interface CompactCardProps {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
  'aria-label'?: string;
}

/**
 * Dense card surface — 12–16px padding, no empty filler. Prefer over `.card` + `.card-body` for dashboards.
 */
export default function CompactCard({
  children,
  className = '',
  as: Tag = 'section',
  'aria-label': ariaLabel,
}: CompactCardProps) {
  return (
    <Tag
      className={`compact-card${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  );
}
