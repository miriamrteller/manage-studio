import React from 'react';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, onCheckedChange, className = '', disabled, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      checked={checked as any}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      disabled={disabled}
      className={`rounded border-gray-300 ${className}`}
      {...props}
    />
  )
);

Checkbox.displayName = 'Checkbox';
