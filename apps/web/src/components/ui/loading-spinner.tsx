/**
 * loading-spinner: Accessible loading indicator
 *
 * Features:
 * - Animated spinner using Tailwind
 * - role="status" for screen readers
 * - aria-label for context
 * - <span sr-only> for additional screen reader text
 *
 * WCAG: Screen reader announcement, semantic HTML
 */
export function LoadingSpinner() {
  return (
    <div
      className="inline-block animate-spin rounded-full border-4 border-gray-300 border-t-primary h-8 w-8"
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
