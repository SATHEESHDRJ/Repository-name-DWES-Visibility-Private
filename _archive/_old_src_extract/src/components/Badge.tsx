interface BadgeProps { label: string; }

const PRESETS: Record<string, string> = {
  active: 'completed',
  in_review: 'progress',
  not_started: 'pending',
  stopped: 'warning',
  pending: 'pending',
  completed: 'completed',
  validated: 'completed',
  verified: 'progress',
  none: 'pending',
  assigned: 'pending',
  in_progress: 'progress',
  paused: 'warning',
  approved: 'completed',
  rework: 'warning',
  ready_for_qc: 'progress',
  pending_approval: 'warning',
};

export default function Badge({ label }: BadgeProps) {
  const tone = PRESETS[label.toLowerCase().replace(/\s+/g, '_')] || 'pending';
  return (
    <span className="dwes-badge" data-tone={tone}>
      {label.replace(/_/g,' ')}
    </span>
  );
}
