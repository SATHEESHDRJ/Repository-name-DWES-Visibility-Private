import { Icon } from 'dwes';

export function CommonIcons() {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <Icon name="cable" size="lg" />
      <Icon name="bolt" size="lg" />
      <Icon name="check_circle" size="lg" filled />
      <Icon name="warning" size="lg" filled />
      <Icon name="build" size="lg" />
      <Icon name="dashboard" size="lg" />
      <Icon name="search" size="lg" />
      <Icon name="settings" size="lg" />
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <Icon name="bolt" size="xs" />
      <Icon name="bolt" size="sm" />
      <Icon name="bolt" size="md" />
      <Icon name="bolt" size="lg" />
      <Icon name="bolt" size="xl" />
    </div>
  );
}

export function FilledVsOutlined() {
  return (
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
      <Icon name="check_circle" size="xl" />
      <Icon name="check_circle" size="xl" filled />
    </div>
  );
}
