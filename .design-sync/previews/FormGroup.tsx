import { FormGroup, FormLabel, FormInput } from 'dwes';

export function LabeledField() {
  return (
    <div style={{ maxWidth: 320 }}>
      <FormGroup>
        <FormLabel htmlFor="ct">Cable tag</FormLabel>
        <FormInput id="ct" defaultValue="W-4021" placeholder="e.g. W-4021" />
      </FormGroup>
    </div>
  );
}

export function StackedFields() {
  return (
    <div style={{ maxWidth: 320, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <FormGroup>
        <FormLabel htmlFor="frm">Frame</FormLabel>
        <FormInput id="frm" defaultValue="A12 — Main Panel" />
      </FormGroup>
      <FormGroup>
        <FormLabel htmlFor="tech">Technician</FormLabel>
        <FormInput id="tech" defaultValue="R. Haddad" />
      </FormGroup>
    </div>
  );
}
