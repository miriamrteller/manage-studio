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
 * - Multiple variants (success, error, info, warning)
 * - Optional action button
 * - Auto-dismiss after duration
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
  // Color variants
  const typeClasses = {
    success: 'bg-green-50 text-green-900 border-green-200',
    error: 'bg-red-50 text-red-900 border-red-200',
    info: 'bg-blue-50 text-blue-900 border-blue-200',
    warning: 'bg-yellow-50 text-yellow-900 border-yellow-200',
  };

  // Auto-dismiss after duration
  if (duration && onClose) {
    setTimeout(onClose, duration);
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 p-4 border rounded-lg shadow-md',
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
