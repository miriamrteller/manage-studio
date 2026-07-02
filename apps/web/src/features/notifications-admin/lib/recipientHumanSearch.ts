import type { BlastRecipientPreview } from './notificationBlastSchema';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns false for UUID-shaped queries — we never filter recipients by internal IDs. */
export function isHumanRecipientSearchQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length > 0 && !UUID_PATTERN.test(trimmed);
}

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function matchesHumanRecipientSearch(
  row: BlastRecipientPreview,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (!trimmed || !isHumanRecipientSearchQuery(trimmed)) {
    return !trimmed;
  }

  const needle = trimmed.toLowerCase();
  return (
    row.recipient_email.toLowerCase().includes(needle) ||
    (row.recipient_name?.toLowerCase().includes(needle) ?? false) ||
    (row.account_name?.toLowerCase().includes(needle) ?? false) ||
    (row.class_names?.toLowerCase().includes(needle) ?? false)
  );
}
