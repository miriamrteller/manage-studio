/**
 * Blocked times ("Times you can't do") are entered as Israel local dates and
 * times and stored as timestamptz in scheduling_blocks, like get_available_slots,
 * which works in Asia/Jerusalem.
 */
const TZ = 'Asia/Jerusalem';

/** Offset of Asia/Jerusalem from UTC at the given moment, in milliseconds. */
function offsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** 'YYYY-MM-DD' + 'HH:MM' in Israel → ISO timestamp. */
export function jerusalemToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let t = wall - offsetMs(new Date(wall));
  // Around a clock change the first guess can be an hour out; one more pass settles it.
  t = wall - offsetMs(new Date(t));
  return new Date(t).toISOString();
}

/** The day after 'YYYY-MM-DD'. */
function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface BlockDraft {
  fromDate: string;
  toDate: string;
  allDay: boolean;
  fromTime: string;
  toTime: string;
}

/** Start and end of a block, or null when the end is not after the start. */
export function blockRange(draft: BlockDraft): { start_time: string; end_time: string } | null {
  if (!draft.fromDate) return null;
  const toDate = draft.toDate || draft.fromDate;
  const start = jerusalemToIso(draft.fromDate, draft.allDay ? '00:00' : draft.fromTime);
  const end = draft.allDay ? jerusalemToIso(nextDay(toDate), '00:00') : jerusalemToIso(toDate, draft.toTime);
  return end > start ? { start_time: start, end_time: end } : null;
}

/** Today in Israel as 'YYYY-MM-DD'. */
export function todayInJerusalem(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

/** A block shown in the list, e.g. "Sun 16 Nov, 10:00 – 12:00", in Israel time. */
export function formatBlock(start: string, end: string, locale: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
  const time = new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const startsAtMidnight = time.format(s) === '00:00';
  const endsAtMidnight = time.format(e) === '00:00';
  if (startsAtMidnight && endsAtMidnight) {
    const lastDay = new Date(e.getTime() - 1);
    const first = day.format(s);
    const last = day.format(lastDay);
    return first === last ? first : `${first} – ${last}`;
  }
  const first = day.format(s);
  const last = day.format(e);
  return first === last
    ? `${first}, ${time.format(s)} – ${time.format(e)}`
    : `${first}, ${time.format(s)} – ${last}, ${time.format(e)}`;
}
