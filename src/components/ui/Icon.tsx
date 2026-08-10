import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';

/** Standard icon size tokens — prefer these over raw pixel values. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<IconSize, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Material Symbols ligature name (snake_case). */
  name: string;
  /** Token or pixel size. Defaults to `md` (20px). */
  size?: IconSize | number;
  /** Material Symbols weight (100–700). */
  weight?: 200 | 300 | 400 | 500 | 600 | 700;
  /** Filled variant (Material Symbols FILL axis). */
  filled?: boolean;
  /** Lucide compat — maps stroke width to Material weight. */
  strokeWidth?: number;
  /** Apply subtle drop-shadow for headers / elevated surfaces. */
  depth?: boolean;
}

function resolveSize(size: IconSize | number | undefined): number {
  if (size === undefined) return SIZE_PX.md;
  if (typeof size === 'number') return size;
  return SIZE_PX[size];
}

function resolveWeight(strokeWidth: number | undefined, weight: number | undefined): number {
  if (weight !== undefined) return weight;
  if (strokeWidth === undefined) return 500;
  if (strokeWidth <= 1.5) return 400;
  if (strokeWidth <= 2) return 500;
  return 600;
}

export const Icon = forwardRef<HTMLSpanElement, IconProps>(function Icon(
  {
    name,
    size,
    weight,
    filled = false,
    strokeWidth,
    depth = false,
    className = '',
    style,
    ...rest
  },
  ref,
) {
  const px = resolveSize(size);
  const w = resolveWeight(strokeWidth, weight);
  const opsz = Math.min(48, Math.max(20, px));

  const iconStyle: CSSProperties = {
    fontSize: px,
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${w}, 'GRAD' 0, 'opsz' ${opsz}`,
    ...style,
  };

  const classes = [
    'ui-icon',
    'material-symbols-rounded',
    depth ? 'ui-icon--depth' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const ariaHidden = rest['aria-label'] ? undefined : rest['aria-hidden'];

  return (
    <span
      ref={ref}
      className={classes}
      style={iconStyle}
      aria-hidden={ariaHidden ?? true}
      {...rest}
    >
      {name}
    </span>
  );
});
