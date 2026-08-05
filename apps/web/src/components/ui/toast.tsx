import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose?: () => void;
  className?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * toast: Brief notification popup
 *
 * Features:
 * - Multiple variants (success, error, info, warning) — all driven by the
 *   existing semantic color tokens (--color-*-light / --color-*), never
 *   hard-coded Tailwind color classes.
 * - Optional action button
 * - Auto-dismiss after duration
 * - Elevation + z-index tokens for consistent layering above other overlays
 * - WCAG: role="status" for screen readers
 *
 * Usage:
 * - Typically controlled by a toast context/hook
 * - Display multiple toasts in a fixed container
 */
export function Toast({
  message,
  type = 'info',
  duration = 5000,
  onClose,
  className,
  action,
}: ToastProps) {
  // Color variants — token-based (this codebase already defines
  // --color-success-light / --color-error-light / --color-info-light /
  // --color-warning-light in index.css Layer 1, so no new tokens are needed).
  const typeClasses = {
    success: 'bg-[var(--color-success-light)] text-[var(--color-success-active)] border-[var(--color-success)]',
    error: 'bg-[var(--color-error-light)] text-[var(--color-error-active)] border-[var(--color-error)]',
    info: 'bg-[var(--color-info-light)] text-[var(--color-info-active)] border-[var(--color-info)]',
    warning: 'bg-[var(--color-warning-light)] text-[var(--color-warning-active)] border-[var(--color-warning)]',
  };

  // Auto-dismiss after duration
  if (duration && onClose) {
    setTimeout(onClose, duration);
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 p-4 border rounded-lg elevation-3 z-[var(--z-toast)] motion-safe animate-slide-in-down',
        typeClasses[type],
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      <div className="flex items-center gap-2">
        {action && (
          <Button
            variant="ghost"
            size="sm"
            onClick={action.onClick}
            className="text-sm font-medium underline hover:opacity-75"
          >
            {action.label}
          </Button>
        )}
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Dismiss notification"
            className="text-lg font-bold leading-none hover:opacity-75"
          >
            ×
          </Button>
        )}
      </div>
    </div>
  );
}
