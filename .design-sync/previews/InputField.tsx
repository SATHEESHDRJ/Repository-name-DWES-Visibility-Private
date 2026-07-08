import { InputField } from 'dwes';

export function Default() {
  return (
    <div style={{ maxWidth: 340 }}>
      <InputField label="Frame ID" value="A12-MAIN" onChange={() => {}} placeholder="e.g. A12-MAIN" />
    </div>
  );
}

export function WithError() {
  return (
    <div style={{ maxWidth: 340 }}>
      <InputField label="Cable tag" value="XZ" onChange={() => {}} error="Tag must be at least 4 characters" />
    </div>
  );
}
