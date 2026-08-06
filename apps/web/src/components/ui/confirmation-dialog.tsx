import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationDialog = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 9)}`);
  const descriptionId = useRef(`dialog-description-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (open) {
      const previouslyFocused = document.activeElement as HTMLElement;
      cancelButtonRef.current?.focus();

      return () => {
        previouslyFocused?.focus?.();
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="dialog-overlay fixed inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        aria-describedby={description ? descriptionId.current : undefined}
        className={cn(
          'dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'w-full max-w-md rounded-lg bg-[var(--surface-raised)] p-6 shadow-xl',
          'border border-[var(--border-default)]'
        )}
      >
        <h2
          id={titleId.current}
          className="text-lg font-semibold text-[var(--color-text-primary)]"
        >
          {title}
        </h2>

        {description && (
          <p
            id={descriptionId.current}
            className="mt-2 text-sm text-[var(--color-text-secondary)]"
          >
            {description}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
              'bg-[var(--surface-raised)] text-[var(--color-text-primary)]',
              'border border-[var(--border-default)]',
              'transition-colors duration-150',
              'hover:bg-[var(--state-hover)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2'
            )}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              variant === 'destructive'
                ? 'bg-[var(--color-error)] text-white hover:opacity-90 focus:ring-[var(--color-error)]'
                : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] focus:ring-[var(--color-primary)]'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmationContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

interface ConfirmationState extends ConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

export const ConfirmationProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<ConfirmationState>({
    open: false,
    title: '',
    resolve: null,
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        ...options,
        open: true,
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    state.resolve?.(true);
    setState((prev) => ({ ...prev, open: false, resolve: null }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState((prev) => ({ ...prev, open: false, resolve: null }));
  };

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      <ConfirmationDialog
        open={state.open}
        title={state.title}
        description={state.description}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        variant={state.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmationContext.Provider>
  );
};

export const useConfirmation = (): ConfirmationContextValue => {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider');
  }

  return context;
};

export { ConfirmationDialog };