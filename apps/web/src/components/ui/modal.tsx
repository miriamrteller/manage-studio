import { ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

/**
 * modal: Accessible modal dialog with focus trap and Escape key support
 *
 * Features:
 * - Native HTML <dialog> element (native focus trap)
 * - Escape key closes modal
 * - aria-labelledby for screen readers
 * - Backdrop backdrop:bg-black/50
 *
 * WCAG: Focus management, keyboard navigation, semantic markup
 */
export function Modal({ isOpen, title, children, onClose, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
      dialog.focus();
    } else {
      dialog.close();
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
      className={cn(
        'rounded-lg shadow-xl backdrop:bg-black/50 p-6 max-w-md w-full',
        className
      )}
      aria-labelledby="modal-title"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 id="modal-title" className="text-2xl font-bold">
          {title}
        </h2>
        <button
          aria-label="Close dialog"
          onClick={onClose}
          className="text-2xl font-bold leading-none hover:opacity-70 focus-visible:outline-2 outline-offset-2"
        >
          ×
        </button>
      </div>
      <div>{children}</div>
    </dialog>
  );
}
