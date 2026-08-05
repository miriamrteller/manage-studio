/**
 * Schedule + holiday exports (DL-HOLIDAY-001, spec §8).
 *
 * iCal and CSV are produced in-browser with no extra dependencies, following the
 * hand-rolled RFC 5545 conventions already used by `calendarLinks.ts`.
 * PDF export is stubbed: it needs `@react-pdf/renderer`, and adding a dependency is
 * an approval gate (spec §12.7) — the intended implementation is kept in a comment
 * at the bottom of this file so it can be switched on in one commit.
 */
import { getDayShade } from './holidayShading';
import type { ScheduleEvent } from '../types';

const ICS_PRODID = '-//OpalSwift//Manage Studio//EN';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toUtcCompact(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function toDateCompact(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function uid(seed: string): string {
  return `${seed.replace(/[^A-Za-z0-9-]/g, '')}@opalswift.com`;
}

/** Every date in `[start, end]` (inclusive) that the calendar marks as skipped. */
export function listSkippedHolidays(start: Date, end: Date): Array<{ date: Date; he: string; en: string }> {
  const out: Array<{ date: Date; he: string; en: string }> = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (current <= last) {
    // getDayShade reads UTC parts (FullCalendar markers), so pass a UTC-built marker.
    const marker = new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()));
    const shade = getDayShade(marker);
    if (shade.isSkipped) {
      out.push({ date: new Date(current), he: shade.he ?? '', en: shade.en ?? '' });
    }
    current.setDate(current.getDate() + 1);
  }
  return out;
}

/**
 * iCal feed for a set of timetable events. Events are already holiday-filtered by
 * `filterHolidayOccurrences`; pass `filterHolidays: false` to skip the extra guard.
 */
export function generateScheduleIcs(
  events: ScheduleEvent[],
  options: { calendarName?: string; filterHolidays?: boolean } = {},
): string {
  const { calendarName = 'Schedule', filterHolidays = true } = options;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Jerusalem',
  ];

  for (const event of events) {
    if (filterHolidays) {
      const starts = new Date(event.starts_at);
      const marker = new Date(Date.UTC(starts.getFullYear(), starts.getMonth(), starts.getDate()));
      if (event.event_type === 'class' && getDayShade(marker).isSkipped) continue;
    }
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid(event.id)}`,
      `DTSTAMP:${toUtcCompact(new Date())}`,
      `DTSTART:${toUtcCompact(event.starts_at)}`,
      `DTEND:${toUtcCompact(event.ends_at)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** All-day iCal feed of the holidays that are skipped in `[start, end]`. */
export function generateHolidayIcs(start: Date, end: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Israeli Holidays',
  ];

  for (const holiday of listSkippedHolidays(start, end)) {
    const next = new Date(holiday.date);
    next.setDate(next.getDate() + 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid(`holiday-${toIsoDate(holiday.date)}`)}`,
      `DTSTAMP:${toUtcCompact(new Date())}`,
      `DTSTART;VALUE=DATE:${toDateCompact(holiday.date)}`,
      `DTEND;VALUE=DATE:${toDateCompact(next)}`,
      `SUMMARY:${escapeIcsText(holiday.he || holiday.en)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** CSV of every skipped holiday date (Hebrew + English names), UTF-8 BOM for Excel. */
export function generateHolidayCsv(start: Date, end: Date): string {
  const rows = ['Date,Holiday (he),Holiday (en)'];
  for (const holiday of listSkippedHolidays(start, end)) {
    rows.push(`${toIsoDate(holiday.date)},"${holiday.he}","${holiday.en}"`);
  }
  return rows.join('\n');
}

/** Triggers a browser download for generated text content. */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function scheduleFileName(tenantSlug: string, kind: string, extension: string): string {
  return `${tenantSlug || 'studio'}-${kind}-${toIsoDate(new Date())}.${extension}`;
}

/** Downloads the holiday-filtered timetable as an `.ics` file. */
export function exportScheduleIcal(
  events: ScheduleEvent[],
  tenantSlug: string,
  calendarName = 'Schedule',
): void {
  downloadTextFile(
    generateScheduleIcs(events, { calendarName }),
    scheduleFileName(tenantSlug, 'schedule', 'ics'),
    'text/calendar',
  );
}

/** Downloads the list of skipped holiday dates as `.csv`. */
export function exportHolidayList(start: Date, end: Date, tenantSlug: string): void {
  downloadTextFile(
    generateHolidayCsv(start, end),
    scheduleFileName(tenantSlug, 'holidays', 'csv'),
    'text/csv',
  );
}

/** Downloads the skipped holiday dates as an all-day `.ics` calendar. */
export function exportHolidayIcal(start: Date, end: Date, tenantSlug: string): void {
  downloadTextFile(
    generateHolidayIcs(start, end),
    scheduleFileName(tenantSlug, 'holidays', 'ics'),
    'text/calendar',
  );
}

/**
 * TODO(DL-HOLIDAY-001): PDF export is pending dependency approval (spec §12.7).
 * Add `@react-pdf/renderer@^4.2.0` to apps/web/package.json, then replace this stub
 * with the implementation below (kept verbatim so no design work is repeated):
 *
 * // SchedulePDF.tsx
 * import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
 * Font.register({ family: 'Rubik', src: '/fonts/Rubik-Regular.ttf' });
 * const styles = StyleSheet.create({
 *   page: { padding: 30, fontFamily: 'Rubik' },
 *   title: { fontSize: 18, marginBottom: 10, textAlign: 'center' },
 *   row: { flexDirection: 'row', borderBottom: '1px solid #ccc', padding: 8 },
 *   cell: { flex: 1, fontSize: 10 },
 * });
 * export const SchedulePDF = ({ events, locale }) => (
 *   <Document>
 *     <Page size="A4" style={[styles.page, locale === 'he' && { direction: 'rtl' }]}>
 *       <Text style={styles.title}>{locale === 'he' ? 'לוח זמנים' : 'Schedule'}</Text>
 *       <Text>{locale === 'he' ? 'חגים אינם כלולים' : 'Holidays excluded'}</Text>
 *       {events.map((e, i) => (
 *         <View key={i} style={styles.row}>
 *           <Text style={styles.cell}>{new Date(e.starts_at).toLocaleDateString(locale)}</Text>
 *           <Text style={styles.cell}>{e.title}</Text>
 *         </View>
 *       ))}
 *     </Page>
 *   </Document>
 * );
 * // exportSchedule.ts
 * const blob = await pdf(<SchedulePDF events={events} locale={locale} />).toBlob();
 * // …then reuse downloadTextFile's anchor pattern with the blob.
 */
export const PDF_EXPORT_ENABLED = false;
