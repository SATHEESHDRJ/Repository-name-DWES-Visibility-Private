interface InputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}

export function InputField({ label, value, onChange, placeholder, type = 'text' }: InputFieldProps) {
  return (
    <div className="dwes-input-group">
      <label className="dwes-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="dwes-input"
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, placeholder = '-- select --' }: SelectFieldProps) {
  return (
    <div className="dwes-input-group">
      <label className="dwes-label">{label}</label>
      <select value={value} onChange={event => onChange(event.target.value)} className="dwes-select">
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
