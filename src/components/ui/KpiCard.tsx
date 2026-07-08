import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

type KpiVariant = 'default' | 'green' | 'blue' | 'amber' | 'red';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  variant?: KpiVariant;
  icon?: ReactNode;
}

const VALUE_CLASS: Record<KpiVariant, string> = {
  default: 'kpi-value',
  green:   'kpi-value-green',
  blue:    'kpi-value-blue',
  amber:   'kpi-value-amber',
  red:     'kpi-value-red',
};

function enhanceKpiIcon(icon: ReactNode): ReactNode {
  if (!isValidElement(icon)) return icon;
  return cloneElement(icon as ReactElement<{ size?: number; filled?: boolean; className?: string }>, {
    size: 22,
    filled: true,
    className: 'kpi-card-icon',
  });
}

export default function KpiCard({ label, value, variant = 'default', icon }: KpiCardProps) {
  return (
    <article
      className="kpi-card"
      data-variant={variant}
    >
      {icon && (
        <div className="kpi-icon-wrap" aria-hidden="true">
          {enhanceKpiIcon(icon)}
        </div>
      )}
      <div className="kpi-content">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-value-base ${VALUE_CLASS[variant]}`}>{value}</div>
      </div>
    </article>
  );
}
