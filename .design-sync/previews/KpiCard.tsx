import { KpiCard, Icon } from 'dwes';

export function Variants() {
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <KpiCard label="Frames complete" value="18 / 24" variant="green" icon={<Icon name="done_all" />} />
      <KpiCard label="Cables wired" value="1,204" variant="blue" icon={<Icon name="cable" />} />
      <KpiCard label="Awaiting QC" value="6" variant="amber" icon={<Icon name="pending_actions" />} />
      <KpiCard label="Rework" value="2" variant="red" icon={<Icon name="build" />} />
    </div>
  );
}

export function Plain() {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <KpiCard label="Total panels" value="24" />
      <KpiCard label="Active technicians" value="7" />
    </div>
  );
}
