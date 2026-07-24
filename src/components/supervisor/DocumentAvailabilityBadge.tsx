import type { DocumentStatus } from '../../utils/documentAvailability';
import { drawingStatusLabel, wiringStatusLabel } from '../../utils/documentAvailability';

interface Props {
  label: 'GA Drawing' | 'Wiring Schedule';
  status: DocumentStatus;
}

export default function DocumentAvailabilityBadge({ label, status }: Props) {
  const text = label === 'GA Drawing' ? drawingStatusLabel(status) : wiringStatusLabel(status);
  const title = status.message
    ?? (status.availability === 'available' && status.fileName
      ? status.fileName
      : undefined);

  return (
    <span
      className={`pj-doc-badge pj-doc-badge--${status.availability}`}
      title={title}
      aria-live="polite"
    >
      <span className="pj-doc-badge__label">{label}:</span>
      {' '}
      <span className="pj-doc-badge__value">{text}</span>
    </span>
  );
}
