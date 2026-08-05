import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/**
 * Pipeline 2 shape: identified, stackable, title + description, dismissed by id.
 */
export interface ToastItemProps {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  className?: string;
  action?: ToastAction;
  onDismiss: (id: string) => void;
}

/**
 * Pre-existing shape (DL-DESIGN-001 and earlier call sites). Kept so this file
 * stays a drop-in replacement — removing it would break every current caller.
 */
export interface LegacyToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  className?: string;
  action?: ToastAction;
  onClose?: () => void;
}

export type ToastProps = ToastItemProps | LegacyToastProps;

function isLegacy(props: ToastProps): props is LegacyToastProps {
  return 'message' in props;
}

/**
 * Variant styling.
 *
 * NOTE ON TOKENS: the spec draft used `--surface-overlay` as the toast
 * background, but in this codebase `--surface-overlay` resolves to
 * `rgba(0, 0, 0, 0.5)` — it is the modal *scrim*, not a panel surface. Using
 * it here would render translucent black cards. `--surface-raised` is the
 * correct elevated-panel token, so it is used instead, with the semantic
 * colour carried by the border + text as the spec intended.
 */
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--color-text-primary)]',
  success: 'bg-[var(--surface-raised)] border-[var(--color-success)] text-[var(--color-success-active)]',
  warning: 'bg-[var(--surface-raised)] border-[var(--color-warning)] text-[var(--color-warning-active)]',
  error: 'bg-[var(--surface-raised)] border-[var(--color-error)] text-[var(--color-error-active)]',
  info: 'bg-[var(--surface-raised)] border-[var(--color-info)] text-[var(--color-info-active)]',
};

/** Errors and warnings interrupt; everything else waits its turn. */
const ASSERTIVE: ToastVariant[] = ['error', 'warning'];

/**
 * toast: transient notification.
 *
 * Design system
 * - Fully token-driven (surface / border / semantic status / state tokens).
 * - Slides in from the inline-end edge; `.animate-slide-in` swaps to
 *   mirrored keyframes under [dir='rtl'] and is disabled entirely under
 *   `prefers-reduced-motion: reduce` (see index.css).
 *
 * Accessibility
 * - role="alert" + aria-live="assertive" for error/warning, role="status" +
 *   aria-live="polite" otherwise. (The draft paired role="alert" with
 *   aria-live="polite", which contradict each other — alert is implicitly
 *   assertive.) Each toast is its own live region; the container is a plain
 *   labelled region so live regions are never nested.
 * - Auto-dismiss pauses on hover and on keyboard focus, so a keyboard or
 *   screen-reader user cannot have the message yanked away mid-read
 *   (WCAG 2.2.1).
 * - The dismiss control is a real button with an accessible name and a 48px
 *   touch target.
 */
export function Toast(props: ToastProps) {
  const legacy = isLegacy(props);

  const variant: ToastVariant = legacy ? props.type ?? 'info' : props.variant ?? 'default';
  const title = legacy ? props.message : props.title;
  const description = legacy ? undefined : props.description;
  const duration = props.duration ?? 5000;
  const { className, action } = props;

  const [paused, setPaused] = useState(false);

  // Held in a ref so changing the callback identity cannot restart the timer.
  const dismissRef = useRef<(() => void) | undefined>(undefined);
  dismissRef.current = legacy
    ? props.onClose
    : () => props.onDismiss(props.id);

  const dismiss = useCallback(() => dismissRef.current?.(), []);

  const dismissable = legacy ? Boolean(props.onClose) : true;

  useEffect(() => {
    if (duration <= 0 || paused || !dismissable) return;
    const timer = setTimeout(() => dismissRef.current?.(), duration);
    return () => clearTimeout(timer);
  }, [duration, paused, dismissable]);

  const assertive = ASSERTIVE.includes(variant);

  return (
    <div
      className={cn(
        'toast-item animate-slide-in rounded-lg border-2 p-4 shadow-elevation-overlay',
        VARIANT_CLASSES[variant],
        className,
      )}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title && <div className="mb-1 text-body-sm font-medium">{title}</div>}
          {description && (
            <div className="text-body-sm text-[var(--color-text-secondary)]">{description}</div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                'touch-target rounded-sm px-2 text-body-sm font-medium underline',
                'hover:bg-[var(--state-hover)]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--state-focus)]',
              )}
            >
              {action.label}
            </button>
          )}

          {dismissable && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss notification"
              className={cn(
                'touch-target rounded-sm leading-none',
                'hover:bg-[var(--state-hover)]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--state-focus)]',
              )}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export interface ToastContainerProps {
  toasts: ToastItemProps[];
  className?: string;
  /** Accessible name for the notification region. */
  label?: string;
}

/**
 * Fixed viewport for stacked toasts. Anchored to the top inline-end corner,
 * which `.toast-container` mirrors for RTL (see index.css). `pointer-events`
 * are disabled on the positioning shell so the corner of the screen stays
 * clickable when no toast is present.
 */
export function ToastContainer({ toasts, className = '', label = 'Notifications' }: ToastContainerProps) {
  return (
    <div
      className={cn('toast-container z-elevation-toast pointer-events-none', className)}
      role="region"
      aria-label={label}
    >
      <div className="pointer-events-auto flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </div>
    </div>
  );
}

export default Toast;
