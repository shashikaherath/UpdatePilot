import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  icon,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 focus:ring-indigo-500 shadow-sm border border-transparent',
    secondary:
      'bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 border border-slate-300 focus:ring-indigo-500 shadow-sm',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 focus:ring-rose-500 shadow-sm border border-transparent',
    ghost:
      'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 focus:ring-indigo-500 border border-transparent',
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <Spinner
          size={size === 'lg' ? 'md' : 'sm'}
          className={variant === 'primary' || variant === 'danger' ? 'text-white' : 'text-slate-600'}
        />
      )}
      {!loading && icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
