import { forwardRef } from 'react';
import type { ImgHTMLAttributes } from 'react';
import {
  DASHBOARD_ICON_REGISTRY,
  type DashboardIconName,
} from './dashboardIconRegistry';

export type DashboardIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

const SIZE_PX: Record<Exclude<DashboardIconSize, number>, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export interface DashboardIconProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'children'> {
  /** Semantic dashboard function key (unique 3D asset per function). */
  name: DashboardIconName;
  size?: DashboardIconSize;
  /** Lucide/Material compat — ignored for raster icons. */
  filled?: boolean;
  strokeWidth?: number;
  weight?: number;
  depth?: boolean;
}

function resolveSize(size: DashboardIconSize | undefined): number {
  if (size === undefined) return SIZE_PX.md;
  if (typeof size === 'number') return size;
  return SIZE_PX[size];
}

/**
 * Filled 3D Android-style dashboard icon (3dicons.co V1 Color/Dynamic, CC0).
 * Use on role dashboards, sidebar, topbar controls, KPI tiles, and action cards only.
 */
export const DashboardIcon = forwardRef<HTMLImageElement, DashboardIconProps>(function DashboardIcon(
  {
    name,
    size,
    className = '',
    depth = false,
    alt,
    'aria-label': ariaLabel,
    'aria-hidden': ariaHidden,
    filled: _filled,
    strokeWidth: _strokeWidth,
    weight: _weight,
    style,
    ...rest
  },
  ref,
) {
  const meta = DASHBOARD_ICON_REGISTRY[name];
  const px = resolveSize(size);
  const labelled = Boolean(ariaLabel || alt);
  const classes = [
    'dashboard-3d-icon',
    'ui-icon',
    depth ? 'dashboard-3d-icon--depth' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <img
      ref={ref}
      src={meta.src}
      width={px}
      height={px}
      className={classes}
      style={style}
      alt={alt ?? ''}
      aria-label={ariaLabel}
      aria-hidden={labelled ? ariaHidden : true}
      draggable={false}
      decoding="async"
      {...rest}
    />
  );
});

export default DashboardIcon;
