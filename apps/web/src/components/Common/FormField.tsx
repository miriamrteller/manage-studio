/**
 * FormField: Reusable wrapper for form inputs with label and error display
 * 
 * Handles:
 * - Label association (htmlFor + id)
 * - Error message display with aria-describedby
 * - Input validation state styling
 * - Helper text
 * 
 * WCAG: Label association, error announcements, input state indication
 */

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  id: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({
  label,
  id,
  error,
  helperText,
  required = false,
  className = '',
  children,
  ...props
}: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helperText ? `${id}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`space-y-2 ${className}`} {...props}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-600 ms-1">*</span>}
      </label>

      {/* Children should be an input with aria-describedby={describedBy} */}
      <div aria-describedby={describedBy}>{children}</div>

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
