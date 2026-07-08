import { FormLabel, FormInput } from 'dwes';

export function Default() {
  return (
    <div style={{ maxWidth: 320 }}>
      <FormLabel htmlFor="pc">Project code</FormLabel>
      <FormInput id="pc" defaultValue="ENOWA-01" />
    </div>
  );
}
