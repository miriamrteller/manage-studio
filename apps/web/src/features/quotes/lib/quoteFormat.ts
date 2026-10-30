import { formatCurrency } from '@shared/format';

function locale(language: string): string {
  return language.startsWith('he') ? 'he-IL' : 'en-GB';
}

export function formatQuoteMoney(amountMinor: number, currency: string, language: string): string {
  return formatCurrency(amountMinor, currency, locale(language));
}

/** A calendar date (YYYY-MM-DD) shown as-is in Asia/Jerusalem. */
export function formatQuoteDate(isoDate: string | null | undefined, language: string): string {
  if (!isoDate) return '—';
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(language), {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem',
  }).format(date);
}

/** Minor units → editable major-unit string ("1250.5" → "1250.50"). */
export function minorToMajorInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(amountMinor % 100 === 0 ? 0 : 2);
}
