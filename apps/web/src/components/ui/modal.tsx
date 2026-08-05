import { ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  /** Visual size variant. Defaults to 'md' (unchanged from previous behavior). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional id of descriptive content inside the modal, wired to aria-describedby. */
  describedById?: string;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

/**
 * modal: Accessible modal dialog with focus trap and Escape key support
 *
 * Features:
 * - Native HTML <dialog> element (native focus trap + native backdrop)
 * - Escape key closes modal
 * - aria-labelledby / aria-describedby for screen readers
 * - Backdrop + elevation driven by design tokens (modal-backdrop, elevation-4)
 * - Size variants via `size` prop, exposed as data-size for CSS hooks
 * - Focus returns to the previously-focused element on close
 *
 * WCAG: Focus management, keyboard navigation, semantic markup
 */
export function Modal({
  isOpen,
  title,
  children,
  onClose,
  className,
  size = 'md',
  describedById,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.focus();
    } else {
      dialog.close();
      previouslyFocusedRef.current?.focus?.();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  return (
    <dialog
      ref={dialogRef}
      data-size={size}
      className={cn(
        'modal-dialog elevation-4 rounded-lg p-6 w-full',
        SIZE_CLASSES[size],
        'motion-safe animate-scale-in',
        className
      )}
      aria-labelledby="modal-title"
      aria-describedby={describedById}
    >
      <div className="flex justify-between items-center mb-4">
        <h2 id="modal-title" className="text-h4">
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close dialog"
          onClick={onClose}
          className="text-2xl font-bold leading-none hover:opacity-70"
        >
          ×
        </Button>
      </div>
      <div>{children}</div>
    </dialog>
  );
}
