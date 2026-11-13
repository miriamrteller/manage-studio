/**
 * Which days a photographer's Google Calendar shows as taken, for the shoot
 * request calendar on the Book page. A day counts as taken when its busy time
 * between 08:00 and 20:00 (studio time) adds up to 4 hours or more, so one
 * short appointment does not grey out a whole day.
 */
export const BUSY_DAY_TIME_ZONE = 'Asia/Jerusalem';
export const BUSY_DAY_MINUTES = 4 * 60;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const STEP_MINUTES = 15;

export interface BusyInterval {
  start: string;
  end: string;
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSY_DAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function localDayAndHour(ms: number): { day: string; hour: number } {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** YYYY-MM-DD days that are taken. Overlapping intervals are counted once. */
export function busyDaysFrom(intervals: BusyInterval[]): Set<string> {
  const step = STEP_MINUTES * 60_000;
  const seen = new Set<number>();
  const minutes = new Map<string, number>();
  for (const interval of intervals) {
    const start = Date.parse(interval.start);
    const end = Date.parse(interval.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    for (let t = Math.floor(start / step) * step; t < end; t += step) {
      if (seen.has(t)) continue;
      seen.add(t);
      const { day, hour } = localDayAndHour(t);
      if (hour < DAY_START_HOUR || hour >= DAY_END_HOUR) continue;
      minutes.set(day, (minutes.get(day) ?? 0) + STEP_MINUTES);
    }
  }
  return new Set([...minutes].filter(([, m]) => m >= BUSY_DAY_MINUTES).map(([day]) => day));
}

/** Today (YYYY-MM-DD) in studio time. */
export function studioToday(now: Date = new Date()): string {
  return localDayAndHour(now.getTime()).day;
}

/** The days of a month (YYYY-MM-DD), month 1-12. */
export function daysOfMonth(year: number, month: number): string[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD day. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}
