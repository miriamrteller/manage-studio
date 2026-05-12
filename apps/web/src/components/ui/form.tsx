import React from 'react';
import { Controller, type Control, type FieldValues, type FieldPath } from 'react-hook-form';

export const Form = ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props}>{children}</form>
);

export interface FormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
  control: Control<TFieldValues>;
  name: TName;
  render: (props: { field: any }) => React.ReactNode;
}

export const FormField = function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({ control, name, render }: FormFieldProps<TFieldValues, TName>) {
  return <Controller control={control} name={name} render={({ field }) => render({ field }) as any} />;
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

export const FormDescription = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-sm text-gray-500 ${className}`}>{children}</p>
);

export const FormMessage = ({ children }: { children?: React.ReactNode }) => (
  <p className="text-sm text-red-600">{children}</p>
);
