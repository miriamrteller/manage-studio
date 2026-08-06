import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ illustration, title, description, action, className }, ref) => {
    const buttonVariantStyles = {
      primary: cn(
        'bg-[var(--color-primary)] text-white',
        'hover:bg-[var(--color-primary-hover)]',
        'focus:ring-[var(--color-primary)]'
      ),
      secondary: cn(
        'bg-[var(--surface-raised)] text-[var(--color-text-primary)] border border-[var(--border-default)]',
        'hover:bg-[var(--state-hover)]',
        'focus:ring-[var(--color-primary)]'
      ),
    };

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center text-center max-w-md mx-auto py-12 px-4',
          className
        )}
        role="status"
        aria-label={title}
      >
        {illustration && (
          <div className="mb-6 text-[var(--color-text-secondary)]" aria-hidden="true">
            {illustration}
          </div>
        )}
        
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          {title}
        </h3>
        
        {description && (
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {description}
          </p>
        )}
        
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              buttonVariantStyles[action.variant ?? 'primary']
            )}
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

export { EmptyState };
