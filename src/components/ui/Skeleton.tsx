import type { ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseStyle = {
    width: width ?? '100%',
    height: height ?? '1em',
  };

  const variantClasses = {
    text: 'skeleton-text',
    circular: 'skeleton-circular',
    rectangular: 'skeleton-rectangular',
    rounded: 'skeleton-rounded',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-wave',
    none: '',
  };

  return (
    <div
      className={`skeleton ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={baseStyle}
      aria-hidden="true"
    />
  );
}

interface SkeletonCardProps {
  children?: ReactNode;
  className?: string;
}

export function SkeletonCard({ children, className = '' }: SkeletonCardProps) {
  return (
    <div
      className={`skeleton-card ${className}`}
    >
      {children}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, columns = 4, className = '' }: SkeletonTableProps) {
  return (
    <div className={`skeleton-table ${className}`}>
      {/* Header */}
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} variant="text" height="1.5em" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} variant="text" height="1em" />
          ))}
        </div>
      ))}
    </div>
  );
}

interface SkeletonKpiProps {
  className?: string;
}

export function SkeletonKpi({ className = '' }: SkeletonKpiProps) {
  return (
    <div className={`skeleton-kpi ${className}`}>
      <div className="skeleton-kpi-icon">
        <Skeleton variant="circular" width="40px" height="40px" />
      </div>
      <div className="skeleton-kpi-content">
        <Skeleton variant="text" width="60%" height="1em" />
        <Skeleton variant="text" width="40%" height="1.5em" />
      </div>
    </div>
  );
}

interface SkeletonListProps {
  items?: number;
  className?: string;
}

export function SkeletonList({ items = 3, className = '' }: SkeletonListProps) {
  return (
    <div className={`skeleton-list ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="skeleton-list-item">
          <Skeleton variant="circular" width="40px" height="40px" />
          <div className="skeleton-list-content">
            <Skeleton variant="text" width="70%" height="1em" />
            <Skeleton variant="text" width="50%" height="0.875em" />
          </div>
        </div>
      ))}
    </div>
  );
}
