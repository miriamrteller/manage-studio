import React from 'react';

export const Card = ({
  children,
  className = '',
  onClick,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode; className?: string }) => (
  <div
    className={`border border-[var(--border-default)] rounded-lg p-6 bg-[var(--surface-base)] elevation-1 hover:[box-shadow:var(--elevation-2)] interact-lift motion-safe transition-shadow duration-200 ease-out ${onClick ? 'cursor-pointer' : ''} ${className}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onClick(event as unknown as React.MouseEvent<HTMLDivElement>);
            }
          }
        : undefined
    }
    {...rest}
  >
    {children}
  </div>
);

export const CardHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`mb-4 ${className}`}>{children}</div>
);

export const CardTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`text-h4 ${className}`}>{children}</h2>
);

export const CardDescription = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-body-sm text-[var(--color-text-secondary)] ${className}`}>{children}</p>
);

export const CardContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={className}>{children}</div>
);
