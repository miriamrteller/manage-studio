import React from 'react';
import { Select } from '../ui/select';
import { Label } from '../ui/label';

/**
 * FormSelect: Form select wrapper with label, error display, and i18n support
 * Combines Label + Select + error handling
 * 
 * WCAG: aria-invalid, aria-describedby for error association
 */

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  htmlFor?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
}

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  (
    {
      label,
      htmlFor,
      error,
      helperText,
      required = false,
      id,
      children,
      ...props
    },
    ref
  ) => {
    const fieldId = id || htmlFor;
    const errorId = error ? `${fieldId}-error` : undefined;
    const helperId = helperText ? `${fieldId}-helper` : undefined;
    const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={fieldId} required={required}>
            {label}
          </Label>
        )}

        <Select
          id={fieldId}
          ref={ref}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={error ? 'border-red-500' : ''}
          {...props}
        >
          {children}
        </Select>

        {error && (
          <p id={errorId} className="text-sm text-red-600">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={helperId} className="text-sm text-gray-600">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

FormSelect.displayName = 'FormSelect';
