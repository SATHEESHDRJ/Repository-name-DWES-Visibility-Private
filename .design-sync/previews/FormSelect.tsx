import { FormSelect } from 'dwes';

export function PanelPicker() {
  return (
    <div style={{ maxWidth: 320 }}>
      <FormSelect defaultValue="main">
        <option value="main">Main Panel</option>
        <option value="sub">Sub Panel</option>
        <option value="junction">Junction Box</option>
        <option value="control">Control Cabinet</option>
      </FormSelect>
    </div>
  );
}
