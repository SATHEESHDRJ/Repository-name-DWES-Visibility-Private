import { FormGroup, FormLabel, FormInput, FormError } from 'dwes';

export function InlineError() {
  return (
    <div style={{ maxWidth: 320 }}>
      <FormGroup>
        <FormLabel htmlFor="tag">Cable tag</FormLabel>
        <FormInput id="tag" defaultValue="XZ" />
        <FormError>Tag must be at least 4 characters.</FormError>
      </FormGroup>
    </div>
  );
}
