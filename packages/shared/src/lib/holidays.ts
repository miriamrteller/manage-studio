/**
 * Israeli holiday detection shared by the web app and (in a Deno-flavoured twin)
 * the Supabase edge functions. See `supabase/functions/_shared/holidays.ts` for
 * the edge copy — the flag masks in both files MUST stay identical.
 *
 * Design notes (DL-HOLIDAY-001):
 * - Detection is computed on the fly from `@hebcal/core`; nothing is stored in the DB.
 * - `il = true` (second argument to `getHolidaysOnDate`) → Israeli observance.
 * - The masks mirror `apps/web/src/features/scheduling/lib/holidayShading.ts`,
 *   which imports `SHADE_FLAGS`/`SKIP_FLAGS` from here so there is a single source of truth.
 * - Eves (Erev Pesach, Erev Rosh Hashana, …) are NOT matched by `SHADE_FLAGS`:
 *   hebcal tags them with `flags.EREV`, which is deliberately excluded. Use
 *   `isErevHoliday()` / `isHolidayOrErev()` when eve handling is wanted.
 *
 * Two masks, two jobs:
 * - `SHADE_FLAGS` (wider) → what the calendar greys out. `isHoliday()`.
 * - `SKIP_FLAGS`  (narrower) → what is REMOVED from schedules and bookings, and what the
 *   holiday export lists. `isSkippedHoliday()` / `isSkippedHolidayInIsrael()`.
 *   Scheduling filters intentionally use the narrower mask so that days which are
 *   ordinary working days in Israel (Yitzhak Rabin Memorial Day, Sigd, Tu BiShvat,
 *   Lag BaOmer …) stay shaded but keep their classes, and so the
 *   "skipped dates" export always matches what actually disappeared from the schedule.
 *   `ALWAYS_SKIPPED_DESCS` adds back specific studio closures (Purim, Yom HaAtzma'ut).
 *   To skip every shaded holiday instead, swap `isSkippedHoliday*` for `isHoliday*` in
 *   `holidayFilter.ts` and `supabase/functions/_shared/holidays.ts`.
 *
 * @module holidays
 */
import { HDate, HebrewCalendar, flags } from '@hebcal/core';

/**
 * Holiday categories that are visually shaded on the calendar. Byte-for-byte the mask
 * `holidayShading.ts` used before this change, so shading behaviour is unchanged.
 * Rosh Chodesh, parsha, candle-lighting and omer are intentionally excluded.
 */
export const SHADE_FLAGS =
  flags.CHAG |
  flags.MINOR_HOLIDAY |
  flags.MODERN_HOLIDAY |
  flags.MINOR_FAST |
  flags.MAJOR_FAST |
  flags.CHOL_HAMOED |
  flags.CHANUKAH_CANDLES;

/**
 * Narrower mask for the calendar's "skipped" state: Yom Tov, fasts, Chol HaMoed and
 * Chanukah candle days. Minor/modern holidays (Tu BiShvat, Lag BaOmer, Sigd …) are
 * shaded but not marked skipped, per spec §7 — except for the named studio closures in
 * `ALWAYS_SKIPPED_DESCS`, which skip regardless of this mask.
 */
export const SKIP_FLAGS =
  flags.CHAG |
  flags.MAJOR_FAST |
  flags.MINOR_FAST |
  flags.CHOL_HAMOED |
  flags.CHANUKAH_CANDLES;

/**
 * hebcal lumps optional custom fasts into `MINOR_FAST`. These are minority
 * observances on ordinary Israeli working days — a studio does not cancel classes for
 * them — so they are shaded but never skipped:
 * - Yom Kippur Katan (`flags.YOM_KIPPUR_KATAN`) — monthly, ~12×/year.
 * - Ta'anit BeHaB — a minhag fast, up to 3×/year.
 * Public fasts (Tzom Gedaliah, Asara B'Tevet, Ta'anit Esther, Tzom Tammuz,
 * Ta'anit Bechorot on Erev Pesach, Tish'a B'Av, Yom Kippur) remain in the skip set.
 * `getDesc()` returns hebcal's stable ASCII key, unlike the localised `render()`.
 */
const NEVER_SKIPPED_DESCS = new Set(["Ta'anit BeHaB"]);

/**
 * Studio decision (2026-08-06): these holidays cancel sessions even though they are
 * technically ordinary working days in Israel. Override SKIP_FLAGS by name.
 * `getDesc()` returns hebcal's stable ASCII key, unlike the localised `render()`.
 */
const ALWAYS_SKIPPED_DESCS = new Set(["Purim", "Yom HaAtzma'ut"]);

function skipsSchedule(ev: { getFlags(): number; getDesc(): string }): boolean {
  const eventFlags = ev.getFlags();
  // Studio override: always cancel regardless of SKIP_FLAGS mask
  if ((eventFlags & SHADE_FLAGS) !== 0 && ALWAYS_SKIPPED_DESCS.has(ev.getDesc())) return true;
  if ((eventFlags & SKIP_FLAGS) === 0) return false;
  if ((eventFlags & flags.YOM_KIPPUR_KATAN) !== 0) return false;
  return !NEVER_SKIPPED_DESCS.has(ev.getDesc());
}

/** All scheduling data is authored and displayed in Israel time. */
export const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

export interface HolidayInfo {
  date: Date;
  hebrewDate: string;
  name: string;
  nameHe: string;
  category: string;
}

const israelDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ISRAEL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Midnight of the civil day named by `date`'s local Y/M/D parts. */
function civilDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Holiday events on a civil day, restricted to Israeli observance. */
function eventsOn(date: Date) {
  return HebrewCalendar.getHolidaysOnDate(new HDate(civilDay(date)), true) ?? [];
}

/** Bitwise OR of the flags of every shade-worthy event on `date` (0 when none). */
export function getHolidayFlags(date: Date): number {
  return eventsOn(date).reduce(
    (mask, ev) => ((ev.getFlags() & SHADE_FLAGS) !== 0 ? mask | ev.getFlags() : mask),
    0,
  );
}

/** True when `date` (local Y/M/D) is a shaded Israeli holiday. Wider than the skip set. */
export function isHoliday(date: Date): boolean {
  return eventsOn(date).some((ev) => (ev.getFlags() & SHADE_FLAGS) !== 0);
}

/**
 * True when `date` is a holiday in the narrower "skip recurring sessions" set,
 * i.e. `SKIP_FLAGS` minus `NEVER_SKIPPED_DESCS`, plus the named studio closures in
 * `ALWAYS_SKIPPED_DESCS` (Purim, Yom HaAtzma'ut).
 */
export function isSkippedHoliday(date: Date): boolean {
  return eventsOn(date).some(skipsSchedule);
}

/** True when the day AFTER `date` is a holiday (i.e. `date` is an eve). */
export function isErevHoliday(date: Date): boolean {
  const day = civilDay(date);
  return isHoliday(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
}

/** Convenience: holiday or eve of a holiday. Not used by default filtering. */
export function isHolidayOrErev(date: Date): boolean {
  return isHoliday(date) || isErevHoliday(date);
}

/**
 * True when the Israel civil day containing `instant` is a holiday. Use this for
 * timestamps coming from the database (`starts_at`), which are absolute instants.
 */
export function isHolidayInIsrael(instant: Date): boolean {
  return isHoliday(israelCivilDay(instant));
}

/**
 * True when the Israel civil day containing `instant` is a holiday that is removed
 * from schedules and bookings. This is the canonical scheduling predicate.
 */
export function isSkippedHolidayInIsrael(instant: Date): boolean {
  return isSkippedHoliday(israelCivilDay(instant));
}

/** Midnight (local) of the Israel civil day that contains `instant`. */
export function israelCivilDay(instant: Date): Date {
  const [year, month, day] = israelDateFormat.format(instant).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Every holiday date in `[start, end]` (inclusive, day granularity). */
export function getHolidayDates(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const last = civilDay(end);
  for (const current = civilDay(start); current <= last; current.setDate(current.getDate() + 1)) {
    if (isHoliday(current)) out.push(new Date(current));
  }
  return out;
}

/** Every date in `[start, end]` that is skipped from recurring generation. */
export function getSkippedHolidayDates(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const last = civilDay(end);
  for (const current = civilDay(start); current <= last; current.setDate(current.getDate() + 1)) {
    if (isSkippedHoliday(current)) out.push(new Date(current));
  }
  return out;
}

/** Details (Hebrew + English names, category) for every holiday on `date`. */
export function getHolidayInfo(date: Date): HolidayInfo[] {
  const day = civilDay(date);
  const hdate = new HDate(day);
  return eventsOn(day)
    .filter((ev) => (ev.getFlags() & SHADE_FLAGS) !== 0)
    .map((ev) => ({
      date: new Date(day),
      hebrewDate: hdate.toString(),
      name: ev.render('en'),
      nameHe: ev.render('he'),
      category: categoryFromFlags(ev.getFlags()),
    }));
}

/** Coarse category label used by exports and the admin calendar legend. */
export function categoryFromFlags(eventFlags: number): string {
  if (eventFlags & flags.CHAG) return 'major';
  if (eventFlags & flags.MAJOR_FAST) return 'major_fast';
  if (eventFlags & flags.MINOR_FAST) return 'minor_fast';
  if (eventFlags & flags.CHOL_HAMOED) return 'chol_hamoed';
  if (eventFlags & flags.CHANUKAH_CANDLES) return 'chanukah';
  if (eventFlags & flags.MODERN_HOLIDAY) return 'modern';
  if (eventFlags & flags.MINOR_HOLIDAY) return 'minor';
  return 'other';
}
