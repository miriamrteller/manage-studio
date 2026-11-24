import { TIMEZONE } from '@/lib/constants';

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** e.g. "Sun 26 Jul 2026, 16:30" (en), "יום ראשון 26 יולי 2026 16:30" (he). 24-hour clock in both. */
export function formatAppointmentWhen(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  if (language === 'he') {
    const parts = new Intl.DateTimeFormat('he-IL', {
      timeZone: TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    return `${partValue(parts, 'weekday')} ${partValue(parts, 'day')} ${partValue(parts, 'month')} ${partValue(parts, 'year')} ${partValue(parts, 'hour')}:${partValue(parts, 'minute')}`.trim();
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);

  return `${partValue(parts, 'weekday')} ${partValue(parts, 'day')} ${partValue(parts, 'month')} ${partValue(parts, 'year')}, ${partValue(parts, 'hour')}:${partValue(parts, 'minute')}`;
}
