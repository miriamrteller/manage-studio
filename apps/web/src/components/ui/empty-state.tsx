import React, { useId } from 'react';
import { cn } from '@/lib/utils';

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
  /** Secondary, lower-emphasis action rendered beside the primary one. */
  secondaryAction?: EmptyStateAction;
  /**
   * Heading level for `title`. Defaults to h3 — override it so the empty
   * state does not skip a level in its host page (axe `heading-order`).
   */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

const ACTION_CLASSES: Record<'primary' | 'secondary', string> = {
  primary: cn(
    'bg-[var(--color-primary)] text-[var(--color-on-primary)]',
    'hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]',
  ),
  secondary: cn(
    'bg-[var(--surface-raised)] text-[var(--color-text-primary)]',
    'border border-[var(--border-default)]',
    'hover:bg-[var(--state-hover)] active:bg-[var(--state-active)]',
  ),
};

function ActionButton({ action }: { action: EmptyStateAction }) {
  const variant = action.variant ?? 'primary';
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={cn(
        'touch-target rounded-md px-4 py-2 text-body-sm font-medium',
        'motion-safe transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-[var(--state-focus)]',
        ACTION_CLASSES[variant],
      )}
    >
      {action.label}
    </button>
  );
}

/**
 * empty-state: the standard "nothing here yet" panel.
 *
 * Design system
 * - Every colour is a token, so tenant branding drives the primary action.
 * - Colour transitions are wrapped in `motion-safe`; the global
 *   `prefers-reduced-motion` guard in index.css neutralises them.
 *
 * Accessibility
 * - Rendered as a <section> named by its own heading via aria-labelledby,
 *   rather than a hard-coded "Empty state" label, so screen-reader users hear
 *   the actual message.
 * - `headingLevel` keeps the document outline valid.
 * - Illustrations are decorative and hidden from assistive tech.
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  secondaryAction,
  headingLevel = 3,
  className = '',
}: EmptyStateProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'mx-auto flex min-h-48 max-w-md flex-col items-center justify-center',
        'p-8 text-center',
        className,
      )}
    >
      {illustration && (
        <div className="mb-6 opacity-60" aria-hidden="true">
          {illustration}
        </div>
      )}

      <Heading id={headingId} className="mb-2 text-h4 text-[var(--color-text-primary)]">
        {title}
      </Heading>

      {description && (
        <p className="mb-6 text-body-sm leading-relaxed text-[var(--color-text-secondary)]">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {action && <ActionButton action={action} />}
          {secondaryAction && (
            <ActionButton action={{ variant: 'secondary', ...secondaryAction }} />
          )}
        </div>
      )}
    </section>
  );
}

export default EmptyState;
