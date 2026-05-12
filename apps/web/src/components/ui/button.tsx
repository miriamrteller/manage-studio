import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', className = '', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-blue-600 text-white hover:bg-blue-700',
      secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
      outline: 'border border-gray-300 hover:bg-gray-50',
      ghost: 'hover:bg-gray-100',
    };
    return (
      <button
        ref={ref}
        className={`px-4 py-2 rounded disabled:opacity-50 ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
