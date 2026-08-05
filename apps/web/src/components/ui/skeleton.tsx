import React from 'react';
import { cn } from '@/lib/utils';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular';

export interface SkeletonProps {
  className?: string;
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  /** Number of stacked bars to render. Only meaningful for variant="text". */
  lines?: number;
  /** Announced to assistive tech while the placeholder is on screen. */
  label?: string;
  children?: React.ReactNode;
}

/**
 * skeleton: loading placeholder with a token-driven shimmer.
 *
 * Design system notes
 * - Colours come from --surface-sunken / --surface-base only, so tenant
 *   branding and any future theme keep working with zero changes here.
 * - The shimmer lives in index.css under `.skeleton.animate-pulse`. It is
 *   scoped to that pair rather than overriding Tailwind's global
 *   `animate-pulse`, reverses direction under [dir='rtl'], and collapses to
 *   a flat fill under `prefers-reduced-motion: reduce`.
 *
 * Accessibility
 * - The shimmering bars are decorative and carry aria-hidden="true".
 * - The wrapper is a polite live region (role="status" + aria-busy) holding a
 *   visually hidden label, so screen readers announce "Loading content" once
 *   instead of reading N empty boxes.
 */
export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines = 1,
  label = 'Loading content',
  children,
}: SkeletonProps) {
  const barClasses = 'skeleton animate-pulse bg-[var(--surface-sunken)]';

  const variantClasses: Record<SkeletonVariant, string> = {
    text: 'h-4 rounded-sm',
    circular: 'rounded-full',
    rectangular: 'rounded-sm',
  };

  const explicitSize: React.CSSProperties = {
    ...(width !== undefined ? { width } : null),
    ...(height !== undefined ? { height } : null),
  };

  const isMultiline = variant === 'text' && lines > 1;

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(isMultiline && 'space-y-2', className)}
    >
      <span className="sr-only">{label}</span>

      {isMultiline ? (
        Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className={cn(barClasses, variantClasses.text)}
            style={{
              // Last line is short, the way a real paragraph ends.
              width: index === lines - 1 ? '75%' : '100%',
              ...explicitSize,
            }}
          />
        ))
      ) : (
        <div
          aria-hidden="true"
          className={cn(barClasses, variantClasses[variant], !height && variant !== 'text' && 'h-full')}
          style={explicitSize}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Convenience wrapper: a skeleton shaped like a card body. */
export function SkeletonCard({ className = '', label }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6',
        className,
      )}
    >
      <span className="sr-only">{label ?? 'Loading content'}</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="skeleton animate-pulse h-4 w-1/3 rounded-sm bg-[var(--surface-sunken)]" />
        <div className="skeleton animate-pulse h-8 w-2/3 rounded-sm bg-[var(--surface-sunken)]" />
        <div className="skeleton animate-pulse h-4 w-full rounded-sm bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}

export default Skeleton;
