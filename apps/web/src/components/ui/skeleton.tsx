import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'rectangular', width, height, lines = 1 }, ref) => {
    const baseClasses =
      'bg-gradient-to-r from-[var(--surface-sunken)] via-[var(--surface-base,var(--surface-raised))] to-[var(--surface-sunken)] bg-[length:200%_100%] animate-pulse';

    const getVariantClasses = () => {
      switch (variant) {
        case 'circular':
          return 'rounded-full';
        case 'text':
          return 'rounded';
        case 'rectangular':
        default:
          return 'rounded-md';
      }
    };

    const getDefaultDimensions = () => {
      switch (variant) {
        case 'circular':
          return { width: width ?? 40, height: height ?? 40 };
        case 'text':
          return { width: width ?? '100%', height: height ?? '1em' };
        case 'rectangular':
        default:
          return { width: width ?? '100%', height: height ?? 20 };
      }
    };

    const dimensions = getDefaultDimensions();

    const style: React.CSSProperties = {
      width: typeof dimensions.width === 'number' ? `${dimensions.width}px` : dimensions.width,
      height: typeof dimensions.height === 'number' ? `${dimensions.height}px` : dimensions.height,
    };

    if (variant === 'text' && lines > 1) {
      return (
        <div
          ref={ref}
          className={cn('flex flex-col gap-2', className)}
          aria-hidden="true"
          role="img"
          aria-label="Loading content"
        >
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className={cn(baseClasses, getVariantClasses())}
              style={{
                ...style,
                width: index === lines - 1 ? '75%' : style.width,
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(baseClasses, getVariantClasses(), className)}
        style={style}
        aria-hidden="true"
        role="img"
        aria-label="Loading content"
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

export { Skeleton };
