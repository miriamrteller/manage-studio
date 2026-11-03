import { formatCurrency } from '@shared/format';
import type { JobPaymentRequestStatus } from '../services/jobPaymentService';

export function localeFor(language: string): string {
  return language === 'he' ? 'he-IL' : 'en-GB';
}

export function formatMinor(amountMinor: number, currency: string, language: string): string {
  return formatCurrency(amountMinor, currency, localeFor(language));
}

export function formatDueDate(isoDate: string | null, language: string): string {
  if (!isoDate) return '—';
  try {
    return new Intl.DateTimeFormat(localeFor(language), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jerusalem',
    }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00`));
  } catch {
    return isoDate;
  }
}

export function statusBadgeVariant(
  status: JobPaymentRequestStatus,
): 'default' | 'secondary' | 'success' | 'destructive' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'cancelled':
    case 'refunded_manual':
      return 'destructive';
    case 'sent':
      return 'default';
    case 'pending':
      return 'secondary';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function statusI18nKey(status: JobPaymentRequestStatus): string {
  return `pages.jobs.payments.status.${status}`;
}

/** Shoot date (booked_starts_at) → YYYY-MM-DD in Asia/Jerusalem for the balance due date. */
export function isoDateInJerusalem(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  return y && m && d ? `${y}-${m}-${d}` : null;
}

/**
 * Starting total for a new payment request: the package price, less what is already
 * requested (pending, sent or paid). Null when nothing is left or the price is unknown.
 */
export function defaultRequestTotalMinor(
  packagePriceMinor: number | null | undefined,
  requests: ReadonlyArray<{ amount_minor: number; status: JobPaymentRequestStatus }>,
): number | null {
  if (packagePriceMinor == null || !Number.isFinite(packagePriceMinor) || packagePriceMinor <= 0) return null;
  const requested = requests
    .filter((r) => r.status === 'pending' || r.status === 'sent' || r.status === 'paid')
    .reduce((sum, r) => sum + r.amount_minor, 0);
  const left = packagePriceMinor - requested;
  return left > 0 ? left : null;
}
