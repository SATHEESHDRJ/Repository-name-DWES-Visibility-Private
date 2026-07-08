import { ProjectInfoCard } from 'dwes';

export function StatusCards() {
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ width: 260 }}>
        <ProjectInfoCard
          title="Main Panel A12"
          subtitle="ENOWA-01 · Substation 3"
          statusLabel="active"
          fields={[{ label: 'Client', value: 'ENOWA' }, { label: 'Progress', value: '87%' }]}
        />
      </div>
      <div style={{ width: 260 }}>
        <ProjectInfoCard
          title="Sub Panel B07"
          subtitle="ENOWA-01 · Substation 3"
          statusLabel="in_review"
          fields={[{ label: 'Client', value: 'ENOWA' }, { label: 'Cables', value: 142 }]}
        />
      </div>
    </div>
  );
}
