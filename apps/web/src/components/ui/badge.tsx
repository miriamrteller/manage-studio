import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'success' | 'destructive';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ variant = 'default', className = '', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-blue-100 text-blue-800',
      secondary: 'bg-gray-100 text-gray-800',
      success: 'bg-green-100 text-green-800',
      destructive: 'bg-red-100 text-red-800',
    };
    return (
      <div
        ref={ref}
        className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
