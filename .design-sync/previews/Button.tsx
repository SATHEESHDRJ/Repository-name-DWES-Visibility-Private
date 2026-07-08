import { Button } from 'dwes';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
      <Button variant="primary">Save changes</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="success">Mark verified</Button>
      <Button variant="danger">Delete frame</Button>
      <Button variant="warning">Flag rework</Button>
      <Button variant="ghost">Dismiss</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <Button variant="primary-lg">Start wiring</Button>
      <Button variant="primary">Continue</Button>
      <Button variant="sm">Details</Button>
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <Button variant="primary">Enabled</Button>
      <Button variant="primary" disabled>Disabled</Button>
      <Button variant="primary" isLoading>Saving…</Button>
    </div>
  );
}
