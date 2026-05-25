/**
 * Time formatting for HH:MM strings with locale support
 */
export function formatTime(time: string, locale: string = 'he-IL') {
  // time is in HH:MM format
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale.startsWith('en'), // 12h for English, 24h for others
  });
}
/**
 * Currency formatting — always use this, never inline Intl calls
 * Always in minor currency units (agorot for ILS)
 */
export function formatCurrency(
  amountMinor: number,
  currency = 'ILS',
  locale = 'he-IL'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amountMinor / 100)
}

/**
 * Date formatting with locale support
 * Always specify Asia/Jerusalem timezone
 */
export function formatDate(
  date: Date | string,
  locale = 'he-IL',
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(new Date(date))
}

/**
 * Israeli phone number formatting
 * Ensures +972 prefix format
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return `+${digits}`
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`
  return `+972${digits}`
}
