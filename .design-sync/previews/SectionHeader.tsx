import { SectionHeader, Button, Icon } from 'dwes';

export function WithActions() {
  return (
    <div style={{ minWidth: 560 }}>
      <SectionHeader
        title="Technician Dashboard"
        description="Frames assigned to you for the current shift, with live wiring progress."
        icon={<Icon name="dashboard" filled />}
        actions={<Button variant="primary">New session</Button>}
      />
    </div>
  );
}

export function Plain() {
  return (
    <div style={{ minWidth: 560 }}>
      <SectionHeader
        title="Cable Schedule"
        description="ENOWA-01 · Main Panel A12 · 142 cables on schedule"
      />
    </div>
  );
}
