import { TIMEZONE } from '@/lib/constants';

function englishOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** e.g. "Sunday 26th July 2026 4:30PM" (en) */
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

  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(date);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const dayNum = Number(partValue(dateParts, 'day'));
  const time = `${partValue(timeParts, 'hour')}:${partValue(timeParts, 'minute')}${partValue(timeParts, 'dayPeriod').toUpperCase()}`;

  return `${partValue(dateParts, 'weekday')} ${englishOrdinal(dayNum)} ${partValue(dateParts, 'month')} ${partValue(dateParts, 'year')} ${time}`;
}
