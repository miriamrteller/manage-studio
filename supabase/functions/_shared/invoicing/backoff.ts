/** Retry delay in minutes: min(2^attempts, 60). */
export function backoffMinutes(attempts: number): number {
  return Math.min(Math.pow(2, attempts), 60);
}

export function backoffScheduledFor(attempts: number, from = new Date()): string {
  const delayMs = backoffMinutes(attempts) * 60 * 1000;
  return new Date(from.getTime() + delayMs).toISOString();
}

export const MAX_DOCUMENT_ATTEMPTS = 5;
export const STALE_PROCESSING_MINUTES = 15;
export const DOCUMENT_BATCH_SIZE = 20;
