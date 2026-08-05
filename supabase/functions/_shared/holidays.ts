/**
 * Deno twin of `packages/shared/src/lib/holidays.ts` (DL-HOLIDAY-001).
 *
 * Edge functions cannot import from `packages/shared` (that tree is bundled for the
 * browser and uses bare npm specifiers), so this standalone module repeats the same
 * logic against the `npm:` specifier. The flag masks MUST stay identical to the
 * shared module and to `apps/web/src/features/scheduling/lib/holidayShading.ts`.
 *
 * Date convention: edge functions work with `YYYY-MM-DD` Israel civil dates and with
 * `Date` objects built as UTC midnight (`new Date("2025-09-23")`). `isHoliday()`
 * therefore reads the UTC Y/M/D parts, so results do not depend on the isolate's
 * local timezone.
 */
import { HDate, HebrewCalendar, flags } from "npm:@hebcal/core@^6.6.0";

/** Shaded + scheduling-blocking holiday categories (mirrors holidayShading.ts). */
export const SHADE_FLAGS =
  flags.CHAG |
  flags.MINOR_HOLIDAY |
  flags.MODERN_HOLIDAY |
  flags.MINOR_FAST |
  flags.MAJOR_FAST |
  flags.CHOL_HAMOED |
  flags.CHANUKAH_CANDLES;

/** Narrower "skipped from recurring generation" set (Yom Tov, fasts, CH"M, Chanukah). */
export const SKIP_FLAGS =
  flags.CHAG |
  flags.MAJOR_FAST |
  flags.MINOR_FAST |
  flags.CHOL_HAMOED |
  flags.CHANUKAH_CANDLES;

/**
 * hebcal lumps optional custom fasts into `MINOR_FAST`. These fall on ordinary Israeli
 * working days and must stay bookable: Yom Kippur Katan (monthly, ~12x/year) and
 * Ta'anit BeHaB (a minhag fast). Public fasts (Tzom Gedaliah, Asara B'Tevet, Ta'anit
 * Esther, Tzom Tammuz, Ta'anit Bechorot, Tish'a B'Av, Yom Kippur) still skip.
 * `getDesc()` is hebcal's stable ASCII key; `render()` is localised. Keep in sync with
 * `NEVER_SKIPPED_DESCS` in packages/shared/src/lib/holidays.ts.
 */
const NEVER_SKIPPED_DESCS = new Set(["Ta'anit BeHaB"]);

type HolidayEvent = { getFlags(): number; getDesc(): string };

function skipsSchedule(ev: HolidayEvent): boolean {
  const eventFlags = ev.getFlags();
  if ((eventFlags & SKIP_FLAGS) === 0) return false;
  if ((eventFlags & flags.YOM_KIPPUR_KATAN) !== 0) return false;
  return !NEVER_SKIPPED_DESCS.has(ev.getDesc());
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function eventsOnParts(year: number, month: number, day: number) {
  // HDate reads the local Y/M/D parts, so build the civil day explicitly.
  return HebrewCalendar.getHolidaysOnDate(new HDate(new Date(year, month - 1, day)), true) ?? [];
}

function eventsOn(date: Date) {
  return eventsOnParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** True when the UTC civil day of `date` is an Israeli holiday that blocks scheduling. */
export function isHoliday(date: Date): boolean {
  return eventsOn(date).some((ev: HolidayEvent) => (ev.getFlags() & SHADE_FLAGS) !== 0);
}

/** True when the UTC civil day of `date` falls in the narrower skip set. */
export function isSkippedHoliday(date: Date): boolean {
  return eventsOn(date).some(skipsSchedule);
}

/** True when a `YYYY-MM-DD` Israel civil date is a holiday. Invalid input → false. */
export function isHolidayIsoDate(isoDate: string): boolean {
  if (!ISO_DATE_RE.test(isoDate)) return false;
  const [year, month, day] = isoDate.split("-").map(Number);
  return eventsOnParts(year, month, day).some(
    (ev: HolidayEvent) => (ev.getFlags() & SHADE_FLAGS) !== 0,
  );
}

/**
 * True when a `YYYY-MM-DD` Israel civil date falls in the narrower skip set — the
 * canonical "no bookable slots today" predicate. Invalid input → false.
 *
 * Deliberately narrower than `isHolidayIsoDate`: days that are ordinary working days in
 * Israel (Rabin Memorial Day, Sigd, Tu BiShvat, Lag BaOmer, Purim, Yom HaAtzma'ut …) are
 * shaded on the calendar but remain bookable, and this matches `DayShade.isSkipped` in
 * the web app so the calendar and the booking widget cannot disagree.
 */
export function isSkippedHolidayIsoDate(isoDate: string): boolean {
  if (!ISO_DATE_RE.test(isoDate)) return false;
  const [year, month, day] = isoDate.split("-").map(Number);
  return eventsOnParts(year, month, day).some(skipsSchedule);
}

/** English holiday names on a `YYYY-MM-DD` Israel civil date (empty when none). */
export function holidayNamesOnIsoDate(isoDate: string): string[] {
  if (!ISO_DATE_RE.test(isoDate)) return [];
  const [year, month, day] = isoDate.split("-").map(Number);
  return eventsOnParts(year, month, day)
    .filter((ev: HolidayEvent) => (ev.getFlags() & SHADE_FLAGS) !== 0)
    .map((ev: { render(locale: string): string }) => ev.render("en"));
}

/** Every holiday date in `[start, end]` (inclusive), iterated in UTC. */
export function getHolidayDates(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (current.getTime() <= last) {
    if (isHoliday(current)) out.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return out;
}

/**
 * Drops holiday dates from a `YYYY-MM-DD` list, except dates that have an explicit
 * `offering_sessions` override — an admin who creates a session on a holiday wins.
 *
 * Pure function so it can be unit-tested without a database.
 */
export function filterHolidayDates(dates: string[], overrideDates: Iterable<string>): string[] {
  const overrides = new Set(overrideDates);
  return dates.filter((date) => overrides.has(date) || !isSkippedHolidayIsoDate(date));
}
