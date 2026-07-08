import type { ReactNode } from 'react';

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  icon?: ReactNode;
  error?: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  icon?: ReactNode;
  error?: string;
}

export function InputField({ label, value, onChange, placeholder, type = 'text', icon, error }: InputFieldProps) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={type === 'text'}
          className={`form-input ${icon ? 'pl-10' : ''} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
        />
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Editable combobox: text input + native <datalist> suggestions.
 * The user can pick a preset OR type a custom value (free text accepted).
 */
export function ComboField({ label, value, onChange, options, placeholder = 'Type or pick…', icon, error }: SelectFieldProps) {
  const listId = `combo-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          list={listId}
          autoComplete="off"
          className={`form-input ${icon ? 'pl-10' : ''} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
        />
        <datalist id={listId}>
          {options.map(option => <option key={option} value={option} />)}
        </datalist>
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function SelectField({ label, value, onChange, options, placeholder = '-- select --', icon, error }: SelectFieldProps) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <select
          value={value}
          onChange={event => onChange(event.target.value)}
          title={label}
          className={`form-select ${icon ? 'pl-10' : ''} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
        >
          <option value="">{placeholder}</option>
          {options.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
