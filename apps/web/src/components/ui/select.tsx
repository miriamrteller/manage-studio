import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <select
    className={cn(
      'w-full px-3 py-2 border border-gray-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
));
Select.displayName = 'Select';

// Stub components for shadcn/ui compatibility
export const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const SelectItem = ({ children, value }: { children: React.ReactNode; value: string }) => (
  <option value={value}>{children}</option>
);
export const SelectTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const SelectValue = ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>;

export { Select };

