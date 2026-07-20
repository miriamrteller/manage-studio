/**
 * Optional client monitoring. Set VITE_SENTRY_DSN when @sentry/react is installed.
 * Until then this is a no-op so production builds stay dependency-free.
 */
export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || dsn.includes('your-') || dsn === '...') return;

  if (import.meta.env.DEV) {
    console.info(
      '[monitoring] VITE_SENTRY_DSN is set. Install @sentry/react and wire Sentry.init here before relying on it in production.',
    );
  }
}
