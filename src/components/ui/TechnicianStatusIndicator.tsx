import { TECH_STATUS_META, type TechResourceStatus } from '../../utils/assignmentCenterUtils';

type TechnicianStatusIndicatorProps = {
  status: TechResourceStatus;
  compact?: boolean;
};

/** Consistent technician status marker for every assignment surface. */
export default function TechnicianStatusIndicator({ status, compact = false }: TechnicianStatusIndicatorProps) {
  const meta = TECH_STATUS_META[status];
  const accessibleLabel = status === 'available' ? 'Available' : meta.label;

  return (
    <span
      className={`tech-status-indicator tech-status-indicator--${status}${compact ? ' is-compact' : ''}`}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <span className="tech-status-indicator__dot" aria-hidden="true" />
      {meta.label && <span className="tech-status-indicator__label">{meta.label}</span>}
    </span>
  );
}
