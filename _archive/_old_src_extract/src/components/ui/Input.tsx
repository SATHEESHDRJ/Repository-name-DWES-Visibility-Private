import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-700">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 text-slate-400 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full h-[42px] rounded-[10px] border border-[#E5E7EB] bg-white text-[14px] text-slate-800
              transition-all duration-200 focus:outline-none focus:border-[#2563EB] focus:ring-[3px] focus:ring-blue-500/10
              disabled:bg-slate-50 disabled:text-slate-500
              ${icon ? 'pl-[38px] pr-3' : 'px-3'}
              ${error ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-red-500/10' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && <span className="text-[12px] text-[#DC2626] font-medium">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
