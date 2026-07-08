import type { HTMLAttributes, ReactNode } from 'react';

export type PageContainerVariant = 'centered' | 'wide';

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Centered readable column (default) or full-width data-dense layout */
  variant?: PageContainerVariant;
  children: ReactNode;
}

/**
 * Shared page width wrapper — centered max-width by default; opt into `wide` for
 * data-dense screens (tables, side-by-side charts). Responsive gutters included.
 */
export default function PageContainer({
  variant = 'centered',
  children,
  className = '',
  ...rest
}: PageContainerProps) {
  const variantClass = variant === 'wide' ? 'page-container--wide' : 'page-container--centered';

  return (
    <div className={`page-container ${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
