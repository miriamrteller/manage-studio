import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

/**
 * FormInput: Form field wrapper with label, error display, and i18n support
 * Combines Label + Input + error handling
 * 
 * WCAG: aria-invalid, aria-describedby for error association
 */

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  htmlFor?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      label,
      htmlFor,
      error,
      helperText,
      required = false,
      id,
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

        <Input
          id={fieldId}
          ref={ref}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={error ? 'border-red-500' : ''}
          {...props}
        />

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

FormInput.displayName = 'FormInput';
