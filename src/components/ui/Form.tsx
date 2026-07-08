import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

interface LabelProps { children: ReactNode; htmlFor?: string; }
export function FormLabel({ children, htmlFor }: LabelProps) {
  return <label className="form-label" htmlFor={htmlFor}>{children}</label>;
}

interface GroupProps { children: ReactNode; className?: string; }
export function FormGroup({ children, className = '' }: GroupProps) {
  return <div className={`form-group ${className}`}>{children}</div>;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> { className?: string; }
export function FormInput({ className = '', ...props }: InputProps) {
  return <input className={`form-input ${className}`} {...props} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  className?: string;
}
export function FormSelect({ children, className = '', ...props }: SelectProps) {
  return <select className={`form-select ${className}`} {...props}>{children}</select>;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { className?: string; }
export function FormTextarea({ className = '', ...props }: TextareaProps) {
  return <textarea className={`form-textarea ${className}`} {...props} />;
}

export function FormError({ children }: { children: ReactNode }) {
  return <p className="form-error">{children}</p>;
}
