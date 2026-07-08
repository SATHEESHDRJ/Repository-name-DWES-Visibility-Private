import { Badge } from 'dwes';

export function StatusVariants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
      <Badge label="active" />
      <Badge label="in_progress" />
      <Badge label="paused" />
      <Badge label="rework" />
      <Badge label="completed" />
      <Badge label="pending" />
      <Badge label="assigned" />
      <Badge label="pending_approval" />
    </div>
  );
}

export function InRowContext() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 220 }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Frame A12 · Main Panel</span>
        <Badge label="validated" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Frame B07 · Sub Panel</span>
        <Badge label="in_review" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Frame C31 · Junction</span>
        <Badge label="not_started" />
      </div>
    </div>
  );
}
