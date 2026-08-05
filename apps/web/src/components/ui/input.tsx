import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Marks the input as invalid; drives data-error styling (red border/outline). */
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => (
    <input
      type={type}
      data-error={error ? 'true' : undefined}
      className={cn('form-control-base', className)}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
