import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', fullWidth = false, isLoading = false, className = '', children, disabled, ...props }, ref) => {
    const variantClasses = {
      default:
        'bg-[var(--color-neutral-200)] text-[var(--color-text-primary)] hover:bg-[var(--color-neutral-300)]',
      primary: 'bg-primary text-on-primary hover:bg-primary-hover',
      secondary: 'bg-secondary text-on-secondary hover:bg-secondary-hover',
      outline:
        'border border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]',
      ghost: 'hover:bg-[var(--color-neutral-100)]',
      destructive:
        'bg-error text-on-primary hover:bg-[var(--color-error-hover)] active:bg-[var(--color-error-active)] focus-visible:ring-2 focus-visible:ring-error',
    };

    const sizeClasses = {
      sm: 'px-3 py-1 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    const widthClass = fullWidth ? 'w-full' : '';
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`rounded transition-opacity disabled:opacity-50 focus-visible:outline-2 outline-offset-2 ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
