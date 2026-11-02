/**
 * True when a payment provider failed because the studio has not entered (or finished entering)
 * its credentials yet. Every provider adapter words this as "... not configured".
 * Checkout then falls back to "pay at the studio" instead of showing parents an error.
 */
export function isProviderNotConfiguredError(error: unknown): boolean {
  return error instanceof Error && /not configured/i.test(error.message);
}
