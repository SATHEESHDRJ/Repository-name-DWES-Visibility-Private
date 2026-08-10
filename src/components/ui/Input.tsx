import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon, error, className = '', ...props }, ref) => {
    return (
      <div className="form-group w-full">
        {label && <label className="form-label">{label}</label>}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 flex items-center justify-center text-slate-400 pointer-events-none">
              {React.isValidElement(icon)
                ? React.cloneElement(icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: 18, strokeWidth: 1.5 })
                : icon}
            </div>
          )}
          <input
            ref={ref}
            className={`form-input ${icon ? 'pl-10' : ''} ${error ? 'border-red-500 focus:border-red-500' : ''} ${className}`}
            {...props}
          />
        </div>
        {error && <span className="form-error">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
