import { FormInput } from 'dwes';

export function Filled() {
  return (
    <div style={{ maxWidth: 320 }}>
      <FormInput defaultValue="A12-MAIN" placeholder="Frame ID" />
    </div>
  );
}

export function Placeholder() {
  return (
    <div style={{ maxWidth: 320 }}>
      <FormInput placeholder="Scan or type cable tag…" />
    </div>
  );
}
