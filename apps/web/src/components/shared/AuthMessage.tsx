/**
 * AuthMessage: Presentational component for success/error messages
 * WCAG: role="alert" for error messages, aria-live="polite" for dynamic updates
 */
import { Alert } from '@/components/ui/alert';

interface AuthMessageProps {
  type: 'success' | 'error';
  text: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function AuthMessage({ type, text, onDismiss, dismissLabel }: AuthMessageProps) {
  return (
    <Alert
      variant={type === 'success' ? 'success' : 'destructive'}
      className="mb-6"
      onDismiss={onDismiss}
      dismissLabel={dismissLabel}
    >
      {text}
    </Alert>
  );
}
