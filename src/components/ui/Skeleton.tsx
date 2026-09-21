import { useId, type ReactNode } from 'react';

export type DwesLoaderSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<DwesLoaderSize, number> = { sm: 36, md: 44, lg: 52 };

const DEFAULT_LABEL = 'Loading\u2026';

export function DwesLoadingIndicator({
  label = DEFAULT_LABEL,
  size = 'md',
  showLabel = true,
  className = '',
}: {
  label?: string;
  size?: DwesLoaderSize;
  showLabel?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const gradId = `dwes-loader-grad-${gid}`;
  const px = SIZE_PX[size];

  return (
    <div
      className={`dwes-loader dwes-loader--${size}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="dwes-loader-visual" aria-hidden="true" style={{ width: px, height: px }}>
        <svg viewBox="0 0 48 48" className="dwes-loader-svg" width={px} height={px}>
          <defs>
            <linearGradient id={gradId} x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <ellipse cx="24" cy="26" rx="19" ry="5" fill="rgba(37, 99, 235, 0.12)" />
          <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(59, 130, 246, 0.14)" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r="19"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="44 75"
            className="dwes-loader-arc"
          />
        </svg>
      </div>
      {showLabel && label ? <span className="dwes-loader-label">{label}</span> : null}
    </div>
  );
}

export function DwesLoadingState({
  label = DEFAULT_LABEL,
  className = 'empty-state',
  size = 'md',
}: {
  label?: string;
  className?: string;
  size?: DwesLoaderSize;
}) {
  return (
    <div className={className}>
      <DwesLoadingIndicator label={label} size={size} />
    </div>
  );
}

export function DwesLoadingCenter({
  label = DEFAULT_LABEL,
  className = 'dwes-loader-center',
  size = 'md',
}: {
  label?: string;
  className?: string;
  size?: DwesLoaderSize;
}) {
  return (
    <div className={className}>
      <DwesLoadingIndicator label={label} size={size} />
    </div>
  );
}

export function DwesLoadingOverlay({
  active,
  label = DEFAULT_LABEL,
  showLabel = false,
  children,
  className,
  hostClassName = 'dwes-loader-host',
}: {
  active: boolean;
  label?: string;
  showLabel?: boolean;
  children: ReactNode;
  className?: string;
  hostClassName?: string;
}) {
  return (
    <div className={`${hostClassName}${className ? ` ${className}` : ''}`}>
      {children}
      {active ? (
        <div className="dwes-loader-overlay" aria-hidden={false}>
          <DwesLoadingIndicator label={label} showLabel={showLabel} size="sm" />
        </div>
      ) : null}
    </div>
  );
}

export function DwesGaViewerLoading({ label = DEFAULT_LABEL }: { label?: string }) {
  return (
    <div className="ga-viewer-message ga-viewer-message--loading" role="status">
      <DwesLoadingIndicator label={label} />
    </div>
  );
}

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
  void rows;
  void columns;
  return (
    <div className={`skeleton-table ${className}`}>
      <DwesLoadingCenter label="Loading…" />
    </div>
  );
}

interface SkeletonKpiProps {
  className?: string;
}

export function SkeletonKpi({ className = '' }: SkeletonKpiProps) {
  return (
    <div className={`skeleton-kpi ${className}`}>
      <DwesLoadingCenter label="Loading…" size="sm" />
    </div>
  );
}

interface SkeletonListProps {
  items?: number;
  className?: string;
}

export function SkeletonList({ items = 3, className = '' }: SkeletonListProps) {
  void items;
  return (
    <div className={`skeleton-list ${className}`}>
      <DwesLoadingCenter label="Loading…" />
    </div>
  );
}
