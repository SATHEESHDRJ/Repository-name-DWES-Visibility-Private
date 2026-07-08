import { FormTextarea } from 'dwes';

export function WithNote() {
  return (
    <div style={{ maxWidth: 380 }}>
      <FormTextarea
        rows={4}
        defaultValue="Torqued all terminals to spec. Verified continuity on circuits 1-14. Two cores re-terminated on TB3."
        placeholder="Add a completion note…"
      />
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ maxWidth: 380 }}>
      <FormTextarea rows={4} placeholder="Add a completion note…" />
    </div>
  );
}
