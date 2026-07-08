import { Input } from 'dwes';

export function WithLabel() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input label="Frame ID" defaultValue="A12-MAIN" placeholder="e.g. A12-MAIN" />
    </div>
  );
}

export function WithError() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input label="Cable tag" defaultValue="XZ" error="Tag must be at least 4 characters" />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input label="Project code" defaultValue="ENOWA-01" disabled />
    </div>
  );
}
