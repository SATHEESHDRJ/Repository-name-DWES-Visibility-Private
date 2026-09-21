import type { ReactNode } from 'react';

interface ActionRowProps {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * Compact action button row — wraps on narrow widths; children should be ~36px desktop / ≥44px touch.
 */
export default function ActionRow({
  children,
  className = '',
  'aria-label': ariaLabel,
}: ActionRowProps) {
  return (
    <div
      className={`action-row${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
