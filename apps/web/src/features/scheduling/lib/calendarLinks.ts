/** Client-side calendar links — no OAuth; works for guest checkout. */

export interface CalendarEventInput {
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  location?: string | null;
}

function toUtcCompact(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Opens Google Calendar with a pre-filled event (user signs in to save). */
export function buildGoogleCalendarEventUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toUtcCompact(event.startsAt)}/${toUtcCompact(event.endsAt)}`,
  });
  if (event.description?.trim()) params.set('details', event.description.trim());
  if (event.location?.trim()) params.set('location', event.location.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Universal calendar file — Apple Calendar, Outlook, etc. */
export function downloadIcsEvent(event: CalendarEventInput, filename = 'appointment.ics'): void {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpalSwift//Manage Studio//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@opalswift.com`,
    `DTSTAMP:${toUtcCompact(new Date().toISOString())}`,
    `DTSTART:${toUtcCompact(event.startsAt)}`,
    `DTEND:${toUtcCompact(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.description?.trim()) lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`);
  if (event.location?.trim()) lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
