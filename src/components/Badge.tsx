interface BadgeProps {
  label: string;
  className?: string;
}

const STATUS_CLASS: Record<string, string> = {
  active:          'badge-green',
  completed:       'badge-green',
  validated:       'badge-green',
  verified:        'badge-green',
  approved:        'badge-green',
  in_progress:     'badge-blue',
  in_review:       'badge-blue',
  ready_for_qc:    'badge-blue',
  paused:          'badge-amber',
  rework:          'badge-orange',
  stopped:         'badge-orange',
  pending:         'badge-gray',
  not_started:     'badge-gray',
  none:            'badge-gray',
  assigned:        'badge-blue',
  pending_approval:'badge-amber',
};

export default function Badge({ label, className = '' }: BadgeProps) {
  const key = label.toLowerCase().replace(/\s+/g, '_');
  const cls = STATUS_CLASS[key] ?? 'badge-gray';
  return (
    <span
      className={`badge ${cls} ${className}`}
    >
      {label.replace(/_/g, ' ')}
    </span>
  );
}
