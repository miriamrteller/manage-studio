import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * EmptyState: Consistent empty-state pattern across admin list pages.
 * Matches the accessible layout used on the public classes page.
 */
export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h2 className="text-center text-lg font-semibold text-gray-700">{title}</h2>
      <p className="max-w-md text-center text-gray-600">{message}</p>
      {actionLabel && onAction && (
        <Button type="button" variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
