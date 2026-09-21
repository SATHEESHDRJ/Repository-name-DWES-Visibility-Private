import type { ReactNode } from 'react';
import { AlertCircle } from './icons';

interface BaseFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  error?: string;
  required?: boolean;
  id?: string;
}

interface InputFieldProps extends BaseFieldProps {
  type?: string;
}

interface SelectFieldProps extends BaseFieldProps {
  options: string[];
}

function FieldLabel({ label, required, htmlFor }: { label: string; required?: boolean; htmlFor?: string }) {
  return (
    <label className={`form-label${required ? ' form-required' : ''}`} htmlFor={htmlFor}>
      {label}
    </label>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="form-error mt-1" role="alert">
      <AlertCircle size={14} aria-hidden />
      <span>{error}</span>
    </p>
  );
}

export function InputField({
  label, value, onChange, placeholder, type = 'text', icon, error, required, id,
}: InputFieldProps) {
  const fieldId = id ?? `field-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
  return (
    <div className="form-group">
      <FieldLabel label={label} required={required} htmlFor={fieldId} />
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={fieldId}
          type={type}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={type === 'text'}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
          className={`form-input ${icon ? 'pl-10' : ''} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
        />
      </div>
      <FieldError error={error} />
    </div>
  );
}

/**
 * Editable combobox: text input + native <datalist> suggestions.
 * The user can pick a preset OR type a custom value (free text accepted).
 */
export function ComboField({
  label, value, onChange, options, placeholder = 'Type or pick…', icon, error, required, id,
}: SelectFieldProps) {
  const fieldId = id ?? `combo-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
  const listId = `${fieldId}-list`;
  return (
    <div className="form-group">
      <FieldLabel label={label} required={required} htmlFor={fieldId} />
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={fieldId}
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          list={listId}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
          className={`form-input ${icon ? 'pl-10' : ''} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
        />
        <datalist id={listId}>
          {options.map(option => <option key={option} value={option} />)}
        </datalist>
      </div>
      <FieldError error={error} />
    </div>
  );
}

export function SelectField({
  label, value, onChange, options, placeholder = '-- select --', icon, error, required, id,
}: SelectFieldProps) {
  const fieldId = id ?? `select-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
  return (
    <div className="form-group">
      <FieldLabel label={label} required={required} htmlFor={fieldId} />
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none z-10">
            {icon}
          </div>
        )}
        <select
          id={fieldId}
          value={value}
          onChange={event => onChange(event.target.value)}
          title={label}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
          className={`form-select ${icon ? 'pl-10' : ''} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
        >
          <option value="">{placeholder}</option>
          {options.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <FieldError error={error} />
    </div>
  );
}

/** Reject whitespace-only values for mandatory fields. */
export function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}
