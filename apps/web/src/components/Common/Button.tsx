import React from 'react';

/**
 * Button: Reusable button component with consistent styling
 * 
 * Variants: primary, secondary, outline, danger
 * Sizes: sm, md, lg
 * States: disabled, loading, icon-only
 * 
 * WCAG: Focus indicators, aria-label support, disabled state
 */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClasses =
    'font-medium rounded transition-colors focus-visible:outline-2 outline-offset-2 disabled:opacity-50';

  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-opacity-90 outline-white',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 outline-primary',
    outline: 'border border-primary text-primary hover:bg-primary hover:text-white outline-primary',
    danger: 'bg-red-600 text-white hover:bg-red-700 outline-white',
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
