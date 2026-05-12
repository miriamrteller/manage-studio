import React from 'react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'warning' | 'info';
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ variant = 'default', className = '', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-blue-50 border border-blue-200 text-blue-800',
      destructive: 'bg-red-50 border border-red-200 text-red-800',
      warning: 'bg-yellow-50 border border-yellow-200 text-yellow-800',
      info: 'bg-blue-50 border border-blue-200 text-blue-800',
    };
    return (
      <div
        ref={ref}
        className={`rounded-lg p-4 ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Alert.displayName = 'Alert';

export const AlertTitle = ({ children }: { children: React.ReactNode }) => (
  <h5 className="font-semibold mb-2">{children}</h5>
);

export const AlertDescription = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm">{children}</p>
);
