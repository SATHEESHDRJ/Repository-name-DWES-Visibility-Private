import type { ReactNode } from 'react';

type StatChipTone = 'default' | 'green' | 'blue' | 'amber' | 'red' | 'gray';

interface StatChipProps {
  label: string;
  value: ReactNode;
  tone?: StatChipTone;
  icon?: ReactNode;
  className?: string;
}

/**
 * Compact metric chip — small padding, not a giant KPI tile.
 */
export default function StatChip({
  label,
  value,
  tone = 'default',
  icon,
  className = '',
}: StatChipProps) {
  return (
    <div className={`stat-chip stat-chip--${tone}${className ? ` ${className}` : ''}`}>
      {icon ? <span className="stat-chip-icon" aria-hidden>{icon}</span> : null}
      <div className="stat-chip-body">
        <span className="stat-chip-label">{label}</span>
        <span className="stat-chip-value">{value}</span>
      </div>
    </div>
  );
}
