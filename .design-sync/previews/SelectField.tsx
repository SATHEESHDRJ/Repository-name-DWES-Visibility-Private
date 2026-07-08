import { SelectField } from 'dwes';

export function Default() {
  return (
    <div style={{ maxWidth: 340 }}>
      <SelectField
        label="Cable colour"
        value="GREEN"
        onChange={() => {}}
        options={['GREEN', 'YELLOW', 'BLUE', 'BROWN', 'BLACK']}
      />
    </div>
  );
}
