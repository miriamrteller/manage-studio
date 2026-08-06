/**
 * Holiday categories that are visually shaded on the calendar. Byte-for-byte the mask
 * `holidayShading.ts` used before this change, so shading behaviour is unchanged.
 * Rosh Chodesh, parsha, candle-lighting and omer are intentionally excluded.
 */
export declare const SHADE_FLAGS: number;
/**
 * Narrower mask for the calendar's "skipped" state: Yom Tov, fasts, Chol HaMoed and
 * Chanukah candle days. Minor/modern holidays (Tu BiShvat, Lag BaOmer, Sigd …) are
 * shaded but not marked skipped, per spec §7 — except for the named studio closures in
 * `ALWAYS_SKIPPED_DESCS`, which skip regardless of this mask.
 */
export declare const SKIP_FLAGS: number;
/** All scheduling data is authored and displayed in Israel time. */
export declare const ISRAEL_TIME_ZONE = "Asia/Jerusalem";
export interface HolidayInfo {
    date: Date;
    hebrewDate: string;
    name: string;
    nameHe: string;
    category: string;
}
/** Bitwise OR of the flags of every shade-worthy event on `date` (0 when none). */
export declare function getHolidayFlags(date: Date): number;
/** True when `date` (local Y/M/D) is a shaded Israeli holiday. Wider than the skip set. */
export declare function isHoliday(date: Date): boolean;
/**
 * True when `date` is a holiday in the narrower "skip recurring sessions" set,
 * i.e. `SKIP_FLAGS` minus `NEVER_SKIPPED_DESCS`, plus the named studio closures in
 * `ALWAYS_SKIPPED_DESCS` (Purim, Yom HaAtzma'ut).
 */
export declare function isSkippedHoliday(date: Date): boolean;
/** True when the day AFTER `date` is a holiday (i.e. `date` is an eve). */
export declare function isErevHoliday(date: Date): boolean;
/** Convenience: holiday or eve of a holiday. Not used by default filtering. */
export declare function isHolidayOrErev(date: Date): boolean;
/**
 * True when the Israel civil day containing `instant` is a holiday. Use this for
 * timestamps coming from the database (`starts_at`), which are absolute instants.
 */
export declare function isHolidayInIsrael(instant: Date): boolean;
/**
 * True when the Israel civil day containing `instant` is a holiday that is removed
 * from schedules and bookings. This is the canonical scheduling predicate.
 */
export declare function isSkippedHolidayInIsrael(instant: Date): boolean;
/** Midnight (local) of the Israel civil day that contains `instant`. */
export declare function israelCivilDay(instant: Date): Date;
/** Every holiday date in `[start, end]` (inclusive, day granularity). */
export declare function getHolidayDates(start: Date, end: Date): Date[];
/** Every date in `[start, end]` that is skipped from recurring generation. */
export declare function getSkippedHolidayDates(start: Date, end: Date): Date[];
/** Details (Hebrew + English names, category) for every holiday on `date`. */
export declare function getHolidayInfo(date: Date): HolidayInfo[];
/** Coarse category label used by exports and the admin calendar legend. */
export declare function categoryFromFlags(eventFlags: number): string;
//# sourceMappingURL=holidays.d.ts.map