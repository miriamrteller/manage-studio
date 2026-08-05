import { HDate, HebrewCalendar } from '@hebcal/core';
import { SHADE_FLAGS, isSkippedHoliday } from '@shared/lib/holidays';

/**
 * Holiday categories that should be visually greyed on the calendar. Covers major
 * Yom Tov, Chol HaMoed, minor holidays, Chanukah, fasts, and Israeli national days.
 * Rosh Chodesh, parsha, candle-lighting, omer, etc. are intentionally excluded.
 *
 * The masks and the skip predicate now live in `@shared/lib/holidays` so the calendar
 * shading, the public schedule filter and the edge-function slot filter cannot drift
 * apart. `isSkippedHoliday()` is the narrower set whose dates are dropped from recurring
 * generation (Yom Tov, fasts, Chol HaMoed, Chanukah) — minor/modern holidays such as
 * Purim or Yom HaAtzma'ut, and optional custom fasts such as Yom Kippur Katan, are
 * shaded but keep their classes.
 */

interface HolidayNames {
  he: string;
  en: string;
  /** Whether recurring occurrences are skipped on this day (see `isSkippedHoliday`). */
  skipped: boolean;
}

// Cache holiday names per civil day to avoid recomputing on every render.
const nameCache = new Map<string, HolidayNames | null>();

function cacheKey(greg: Date): string {
  return `${greg.getFullYear()}-${greg.getMonth()}-${greg.getDate()}`;
}

/** Hebrew + English holiday names for a civil date, or null when not a shaded holiday. */
function holidayNamesOn(greg: Date): HolidayNames | null {
  const key = cacheKey(greg);
  const cached = nameCache.get(key);
  if (cached !== undefined) return cached;

  const events = HebrewCalendar.getHolidaysOnDate(new HDate(greg), true) ?? [];
  const relevant = events.filter((e) => (e.getFlags() & SHADE_FLAGS) !== 0);
  const names: HolidayNames | null =
    relevant.length > 0
      ? {
          he: relevant[0].render('he'),
          en: relevant[0].render('en'),
          skipped: isSkippedHoliday(greg),
        }
      : null;

  nameCache.set(key, names);
  return names;
}

export interface DayShade {
  shaded: boolean;
  /** Hebrew label (always present when shaded). */
  he?: string;
  /** English label (shown alongside Hebrew in the English UI). */
  en?: string;
  isErev?: boolean;
  /**
   * True when the day itself is a holiday that is skipped when generating recurring
   * class occurrences (see `isSkippedHoliday`). Shabbat and eves are shaded but not
   * skipped, and minor/modern holidays are shaded only.
   */
  isSkipped: boolean;
}

/**
 * Determines whether a calendar day should be greyed out and its labels.
 * A day is shaded if it is Shabbat, a holiday, or the eve (day before) of either.
 * `date` is a FullCalendar marker (UTC-based); its UTC parts are the displayed day.
 */
export function getDayShade(date: Date): DayShade {
  const greg = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

  // The day itself: holiday takes precedence over the plain "Shabbat" label.
  const today = holidayNamesOn(greg);
  if (today) {
    return {
      shaded: true,
      he: today.he,
      en: today.en,
      isSkipped: today.skipped,
    };
  }
  if (greg.getDay() === 6) return { shaded: true, he: 'שבת', en: 'Shabbat', isSkipped: false };

  // Eve: shade the day before a holiday or Shabbat.
  const next = new Date(greg.getFullYear(), greg.getMonth(), greg.getDate() + 1);
  const nextNames = holidayNamesOn(next);
  if (nextNames) {
    return {
      shaded: true,
      he: `ערב ${nextNames.he}`,
      en: `Erev ${nextNames.en}`,
      isErev: true,
      isSkipped: false,
    };
  }
  if (next.getDay() === 6) {
    return { shaded: true, he: 'ערב שבת', en: 'Erev Shabbat', isErev: true, isSkipped: false };
  }

  return { shaded: false, isSkipped: false };
}
