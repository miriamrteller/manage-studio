import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant: 'default' | 'success' | 'warning' | 'error';
  duration: number;
  onDismiss: (id: string) => void;
}

export interface ToastProps extends ToastData {
  className?: string;
}

const variantStyles: Record<ToastData['variant'], string> = {
  default: 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--color-text-primary)]',
  success: 'bg-[var(--color-success)] border-[var(--color-success)] text-white',
  warning: 'bg-[var(--color-warning)] border-[var(--color-warning)] text-[var(--color-text-primary)]',
  error: 'bg-[var(--color-error)] border-[var(--color-error)] text-white',
};

const Toast = ({ id, title, description, variant, duration, onDismiss, className }: ToastProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (duration > 0) {
      timerRef.current = setTimeout(() => {
        onDismiss(id);
      }, duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [id, duration, onDismiss]);

  const handleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onDismiss(id);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border shadow-lg',
        'toast-slide-in',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          {title && (
            <p className="text-sm font-semibold">{title}</p>
          )}
          {description && (
            <p className={cn('text-sm', title && 'mt-1', variant === 'default' && 'text-[var(--color-text-secondary)]')}>
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className={cn(
            'flex-shrink-0 rounded-md p-1 transition-opacity',
            'hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-offset-2',
            variant === 'default' ? 'focus:ring-[var(--color-primary)]' : 'focus:ring-white/50'
          )}
          aria-label="Dismiss notification"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export interface ToastContainerProps {
  toasts: ToastData[];
  className?: string;
}

const ToastContainer = ({ toasts, className }: ToastContainerProps) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        'fixed top-4 inset-inline-end-4 z-50 flex flex-col gap-2 pointer-events-none',
        className
      )}
      style={{
        insetInlineEnd: '1rem',
      }}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
};

type ToastOptions = Omit<ToastData, 'id' | 'onDismiss' | 'duration'> & {
  duration?: number;
};

interface ToastContextValue {
  toasts: ToastData[];
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = useCallback((options: ToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast: ToastData = {
      id,
      variant: options.variant ?? 'default',
      duration: options.duration ?? 5000,
      title: options.title,
      description: options.description,
      onDismiss: dismiss,
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, dismissAll }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
};

export const useToast = (): Omit<ToastContextValue, 'toasts'> => {
  const context = useContext(ToastContext);
  
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return {
    toast: context.toast,
    dismiss: context.dismiss,
    dismissAll: context.dismissAll,
  };
};

export { Toast, ToastContainer };
export type { ToastData as Toast };