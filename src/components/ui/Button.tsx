import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'primary-lg' | 'secondary' | 'danger' | 'ghost' | 'sm' | 'icon' | 'success' | 'warning';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children?: ReactNode;
  isLoading?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  'primary':    'btn-primary',
  'primary-lg': 'btn-primary-lg',
  'secondary':  'btn-secondary',
  'danger':     'btn-danger',
  'ghost':      'btn-ghost',
  'sm':         'btn-sm',
  'icon':       'btn-icon',
  'success':    'btn-success',
  'warning':    'btn-warning',
};

export function Button({
  variant = 'secondary',
  children,
  className = '',
  disabled,
  isLoading,
  ...props
}: ButtonProps) {
  const loadingClass = isLoading ? 'btn--loading' : '';

  return (
    <button
      className={`${VARIANT_CLASS[variant]} ${loadingClass} ${className}`.trim()}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
