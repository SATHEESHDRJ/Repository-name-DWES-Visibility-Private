import { ComboField } from 'dwes';

export function Default() {
  return (
    <div style={{ maxWidth: 340 }}>
      <ComboField
        label="Destination panel"
        value="Main Panel"
        onChange={() => {}}
        options={['Main Panel', 'Sub Panel', 'Junction Box', 'Control Cabinet']}
      />
    </div>
  );
}
