/**
 * AuthMessage: Presentational component for success/error messages
 * WCAG: role="alert" for error messages, aria-live="polite" for dynamic updates
 */

interface AuthMessageProps {
  type: 'success' | 'error';
  text: string;
}

export function AuthMessage({ type, text }: AuthMessageProps) {
  return (
    <div
      className={`mb-6 p-4 rounded ${
        type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      }`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {text}
    </div>
  );
}
