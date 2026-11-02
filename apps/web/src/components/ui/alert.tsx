import React from 'react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'destructive' | 'warning' | 'info';
}

/**
 * One clean box per message: a single rounded border + tinted fill, status
 * colours fixed for AA (800-weight text on a 50 tint). Pass `onDismiss` to add
 * a close button inside the box. Errors announce assertively, the rest politely.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps & { onDismiss?: () => void; dismissLabel?: string }>(
  ({ variant = 'default', className = '', onDismiss, dismissLabel = 'Dismiss', children, role, ...props }, ref) => {
    const variantClasses = {
      default: 'bg-blue-50 border-blue-200 text-blue-800',
      success: 'bg-green-50 border-green-200 text-green-800',
      destructive: 'bg-red-50 border-red-200 text-red-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
      info: 'bg-blue-50 border-blue-200 text-blue-800',
    };
    const isError = variant === 'destructive';
    return (
      <div
        ref={ref}
        role={role ?? (isError ? 'alert' : 'status')}
        aria-live={isError ? 'assertive' : 'polite'}
        className={`flex items-start gap-3 rounded-lg border p-4 text-start ${variantClasses[variant]} ${className}`}
        {...props}
      >
        <div className="min-w-0 flex-1">{children}</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            className="-m-1 shrink-0 rounded p-1 leading-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
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
