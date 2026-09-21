import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'primary' | 'secondary' | 'small' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'primary',
  icon,
  isLoading,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyle = 'inline-flex items-center justify-center font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[#2563EB] hover:bg-blue-700 text-white focus:ring-[#2563EB]',
    secondary: 'bg-[#F8FAFC] hover:bg-gray-100 text-slate-700 border border-[#E5E7EB] focus:ring-gray-200',
    danger: 'bg-[#DC2626] hover:bg-red-700 text-white focus:ring-[#DC2626]',
    ghost: 'bg-transparent hover:bg-gray-100 text-slate-700 focus:ring-gray-200'
  };
  
  const sizes = {
    primary: 'h-[44px] px-6 rounded-[10px] text-[15px]',
    secondary: 'h-[40px] px-4 rounded-[10px] text-[14px]',
    small: 'h-[36px] px-3 rounded-[10px] text-[13px]',
    icon: 'h-[40px] w-[40px] rounded-[10px] p-0'
  };

  const selectedVariant = variants[variant];
  const selectedSize = sizes[size];

  return (
    <button
      className={`${baseStyle} ${selectedVariant} ${selectedSize} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : icon ? (
        <span className={children ? 'mr-2' : ''}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
