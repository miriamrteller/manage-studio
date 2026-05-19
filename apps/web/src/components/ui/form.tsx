import React from 'react';
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

export const Form = ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props}>{children}</form>
);

export interface FormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
  control: Control<TFieldValues>;
  name: TName;
  render: (props: {
    field: ControllerRenderProps<TFieldValues, TName>;
  }) => React.ReactNode;
}

export const FormField = function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({ control, name, render }: FormFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <>{render({ field })}</>}
    />
  );
};

export const FormItem = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`space-y-2 ${className}`}>{children}</div>
);

export const FormLabel = ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className="text-sm font-medium" {...props}>
    {children}
  </label>
);

export const FormControl = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={className}>{children}</div>
);

export const FormDescription = ({ children, className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-gray-500 ${className}`} {...props}>
    {children}
  </p>
);

export const FormMessage = ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className="text-sm text-red-600" {...props}>
    {children}
  </p>
);

// Composite form components combining input + label + error messaging

interface FormInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label?: string;
  error?: string;
  helperText?: string;
  htmlFor?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, helperText, htmlFor, className = '', ...props }, ref) => {
    const inputId = htmlFor || (props.name as string);
    return (
      <FormItem>
        {label && <FormLabel htmlFor={inputId}>{label}</FormLabel>}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 disabled:opacity-50 ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
          } ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {error && (
          <FormMessage id={`${inputId}-error`}>{error}</FormMessage>
        )}
        {helperText && !error && (
          <FormDescription id={`${inputId}-helper`}>{helperText}</FormDescription>
        )}
      </FormItem>
    );
  }
);
FormInput.displayName = 'FormInput';

interface FormTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label?: string;
  error?: string;
  helperText?: string;
  htmlFor?: string;
}

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, error, helperText, htmlFor, className = '', ...props }, ref) => {
    const textareaId = htmlFor || (props.name as string);
    return (
      <FormItem>
        {label && <FormLabel htmlFor={textareaId}>{label}</FormLabel>}
        <textarea
          ref={ref}
          id={textareaId}
          className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 disabled:opacity-50 ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
          } ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />
        {error && (
          <FormMessage id={`${textareaId}-error`}>{error}</FormMessage>
        )}
        {helperText && !error && (
          <FormDescription id={`${textareaId}-helper`}>{helperText}</FormDescription>
        )}
      </FormItem>
    );
  }
);
FormTextarea.displayName = 'FormTextarea';

interface FormSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label?: string;
  error?: string;
  helperText?: string;
  htmlFor?: string;
  options?: Array<{ value: string | number; label: string }>;
}

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ label, error, helperText, htmlFor, className = '', options = [], children, ...props }, ref) => {
    const selectId = htmlFor || (props.name as string);
    return (
      <FormItem>
        {label && <FormLabel htmlFor={selectId}>{label}</FormLabel>}
        <select
          ref={ref}
          id={selectId}
          className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 disabled:opacity-50 ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
          } ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {children}
        </select>
        {error && (
          <FormMessage id={`${selectId}-error`}>{error}</FormMessage>
        )}
        {helperText && !error && (
          <FormDescription id={`${selectId}-helper`}>{helperText}</FormDescription>
        )}
      </FormItem>
    );
  }
);
FormSelect.displayName = 'FormSelect';
