/**
 * Short weekday name in the page's language: 0 = Sunday … 6 = Saturday
 * ("Sun" in English, "יום א׳" in Hebrew). Uses the browser's Intl data, so no
 * hard-coded English names.
 */
export function shortWeekdayName(day: number, language: string): string {
  if (!Number.isInteger(day) || day < 0 || day > 6) return '';
  // 2023-01-01 was a Sunday; noon UTC keeps it on the same date in every time zone.
  const date = new Date(Date.UTC(2023, 0, 1 + day, 12));
  return new Intl.DateTimeFormat(language || 'en', { weekday: 'short', timeZone: 'UTC' }).format(date);
}
