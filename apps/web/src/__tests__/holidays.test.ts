/**
 * DL-HOLIDAY-001 — shared holiday utility, calendar shading and public-schedule filter.
 * Covers spec test IDs T-01…T-19 and T-26…T-29.
 * Run: pnpm -C apps/web test holidays.test.ts
 *
 * Dates were verified against @hebcal/core (Israeli observance, `il = true`).
 * Two spec dates were wrong and are corrected here, with the real dates asserted:
 * - "Simchat Torah 5785 = Oct 25 2024" → in Israel it is Shmini Atzeret/Simchat Torah
 *   on Oct 24 2024 (Oct 25 is a plain Friday).
 * - "Chanukah 5785 = Dec 26 2024 – Jan 2 2025" → the candle days run Dec 25 2024 –
 *   Jan 2 2025 (nine civil dates, first candle on Dec 25).
 * Eves (Erev Rosh Hashana, Erev Yom Kippur, …) are NOT holidays under SHADE_FLAGS —
 * hebcal tags them `flags.EREV`, which the mask deliberately excludes. The calendar
 * still shades them via `getDayShade`'s next-day lookup, and `isErevHoliday()` exposes
 * the check explicitly. Spec T-11/T-12 assumed the opposite; the real behaviour is asserted.
 */
import { describe, it, expect } from 'vitest';
import {
  SHADE_FLAGS,
  SKIP_FLAGS,
  getHolidayDates,
  getHolidayInfo,
  getSkippedHolidayDates,
  isErevHoliday,
  isHoliday,
  isSkippedHoliday,
  isSkippedHolidayInIsrael,
} from '@shared/lib/holidays';
import { getDayShade } from '@/features/scheduling/lib/holidayShading';
import { filterHolidayOccurrences } from '@/features/scheduling/lib/holidayFilter';
import type { ScheduleEvent } from '@/features/scheduling/types';

/** Local-midnight civil date (what isHoliday expects). */
function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

/** FullCalendar-style UTC marker (what getDayShade expects). */
function marker(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('isHoliday — major holidays (T-01…T-10)', () => {
  it('T-01 Rosh Hashana I 5785 (Oct 3 2024)', () => {
    expect(isHoliday(d(2024, 10, 3))).toBe(true);
  });

  it('T-01b Rosh Hashana II 5785 (Oct 4 2024)', () => {
    expect(isHoliday(d(2024, 10, 4))).toBe(true);
  });

  it('T-02 Yom Kippur 5785 (Oct 12 2024)', () => {
    expect(isHoliday(d(2024, 10, 12))).toBe(true);
  });

  it('T-03 Sukkot I 5785 (Oct 17 2024)', () => {
    expect(isHoliday(d(2024, 10, 17))).toBe(true);
  });

  it('T-04 Chol HaMoed Sukkot 5785 (Oct 18–23 2024)', () => {
    for (let day = 18; day <= 23; day += 1) {
      expect(isHoliday(d(2024, 10, day))).toBe(true);
    }
  });

  it('T-05 Shmini Atzeret / Simchat Torah 5785 (Oct 24 2024), Oct 25 is a regular Friday', () => {
    expect(isHoliday(d(2024, 10, 24))).toBe(true);
    expect(isHoliday(d(2024, 10, 25))).toBe(false);
  });

  it('T-06/T-07 all Chanukah 5785 candle days (Dec 25 2024 – Jan 2 2025)', () => {
    const chanukah = [
      d(2024, 12, 25),
      d(2024, 12, 26),
      d(2024, 12, 27),
      d(2024, 12, 28),
      d(2024, 12, 29),
      d(2024, 12, 30),
      d(2024, 12, 31),
      d(2025, 1, 1),
      d(2025, 1, 2),
    ];
    for (const date of chanukah) {
      expect(isHoliday(date)).toBe(true);
    }
    expect(isHoliday(d(2025, 1, 3))).toBe(false);
  });

  it('T-08 Pesach I 5785 (Apr 13 2025)', () => {
    expect(isHoliday(d(2025, 4, 13))).toBe(true);
  });

  it('T-09 Chol HaMoed Pesach 5785 (Apr 14–18 2025) and Pesach VII (Apr 19)', () => {
    for (let day = 14; day <= 19; day += 1) {
      expect(isHoliday(d(2025, 4, day))).toBe(true);
    }
    expect(isHoliday(d(2025, 4, 20))).toBe(false);
  });

  it('T-10 Shavuot 5785 (Jun 2 2025)', () => {
    expect(isHoliday(d(2025, 6, 2))).toBe(true);
  });
});

describe('studio cancel decisions (T-28, T-29)', () => {
  it('T-28 Purim 5785 (Mar 14 2025) is now a skipped holiday', () => {
    expect(isSkippedHoliday(d(2025, 3, 14))).toBe(true);
    expect(isHoliday(d(2025, 3, 14))).toBe(true);
  });

  it("T-29 Yom HaAtzma'ut 5785 (May 1 2025) is now a skipped holiday", () => {
    expect(isSkippedHoliday(d(2025, 5, 1))).toBe(true);
    expect(isHoliday(d(2025, 5, 1))).toBe(true);
  });
});

describe('isHoliday — eves, fasts and regular days (T-11…T-16)', () => {
  it('T-11 Erev Rosh Hashana (Oct 2 2024) is not itself a holiday but is an eve', () => {
    expect(isHoliday(d(2024, 10, 2))).toBe(false);
    expect(isErevHoliday(d(2024, 10, 2))).toBe(true);
    const shade = getDayShade(marker(2024, 10, 2));
    expect(shade.shaded).toBe(true);
    expect(shade.isErev).toBe(true);
    expect(shade.isSkipped).toBe(false);
  });

  it('T-12 Erev Yom Kippur (Oct 11 2024) behaves the same way', () => {
    expect(isHoliday(d(2024, 10, 11))).toBe(false);
    expect(isErevHoliday(d(2024, 10, 11))).toBe(true);
  });

  it("T-13 Tish'a B'Av 5784 (Aug 13 2024) — MAJOR_FAST", () => {
    expect(isHoliday(d(2024, 8, 13))).toBe(true);
    expect(isSkippedHoliday(d(2024, 8, 13))).toBe(true);
  });

  it('T-14 Tzom Gedaliah 5785 (Oct 6 2024) — MINOR_FAST', () => {
    expect(isHoliday(d(2024, 10, 6))).toBe(true);
    expect(isSkippedHoliday(d(2024, 10, 6))).toBe(true);
  });

  it('T-15 regular weekday (Nov 15 2024) is not a holiday', () => {
    expect(isHoliday(d(2024, 11, 15))).toBe(false);
  });

  it('T-16 late-evening local time on Pesach I still resolves to the holiday', () => {
    expect(isHoliday(new Date(2025, 3, 13, 23, 59, 0))).toBe(true);
    expect(isHoliday(new Date(2025, 3, 13, 0, 1, 0))).toBe(true);
  });
});

describe('getHolidayDates / getHolidayInfo (T-17)', () => {
  it('T-17 returns every holiday date in October 2024 (12 dates)', () => {
    const dates = getHolidayDates(d(2024, 10, 1), d(2024, 10, 31));
    const isoDays = dates.map((date) => date.getDate());
    expect(isoDays).toEqual([3, 4, 6, 12, 17, 18, 19, 20, 21, 22, 23, 24]);
  });

  it('T-17b range end is inclusive and non-holiday ranges are empty', () => {
    expect(getHolidayDates(d(2024, 10, 12), d(2024, 10, 12))).toHaveLength(1);
    expect(getHolidayDates(d(2024, 11, 19), d(2024, 11, 21))).toHaveLength(0);
  });

  it('T-17c exposes Hebrew + English names and a category', () => {
    const [info] = getHolidayInfo(d(2024, 10, 12));
    expect(info.name).toMatch(/Yom Kippur/i);
    expect(info.nameHe.length).toBeGreaterThan(0);
    // Yom Kippur carries both CHAG and MAJOR_FAST; CHAG is checked first (spec §4).
    expect(info.category).toBe('major');
    expect(info.hebrewDate).toMatch(/Tishrei/i);
  });

  it('T-17d categorises each holiday family', () => {
    expect(getHolidayInfo(d(2024, 8, 13))[0].category).toBe('major_fast'); // Tish'a B'Av
    expect(getHolidayInfo(d(2024, 10, 6))[0].category).toBe('minor_fast'); // Tzom Gedaliah
    expect(getHolidayInfo(d(2024, 10, 18))[0].category).toBe('chol_hamoed');
    expect(getHolidayInfo(d(2024, 12, 27))[0].category).toBe('chanukah');
    expect(getHolidayInfo(d(2025, 5, 1))[0].category).toBe('modern'); // Yom HaAtzma'ut
    expect(getHolidayInfo(d(2025, 3, 14))[0].category).toBe('minor'); // Purim
    expect(getHolidayInfo(d(2024, 11, 20))).toEqual([]);
  });

  it('T-17e getSkippedHolidayDates is the narrower, schedule-affecting list', () => {
    // November 2024 holds only modern observances (Yom HaAliyah, Rabin Memorial Day,
    // Sigd) and optional custom fasts (Ta'anit BeHaB, Yom Kippur Katan) → six shaded
    // days, none of which removes a class.
    const shaded = getHolidayDates(d(2024, 11, 1), d(2024, 11, 30));
    const skipped = getSkippedHolidayDates(d(2024, 11, 1), d(2024, 11, 30));
    expect(shaded.length).toBe(6);
    expect(skipped).toHaveLength(0);
  });
});

describe('calendar shading — isSkipped (T-26)', () => {
  it('marks Yom Kippur and Chol HaMoed as skipped', () => {
    expect(getDayShade(marker(2024, 10, 12)).isSkipped).toBe(true);
    expect(getDayShade(marker(2024, 10, 20)).isSkipped).toBe(true);
  });

  it('shades Pesach week and marks it skipped (Apr 13–19 2025)', () => {
    for (let day = 13; day <= 19; day += 1) {
      const shade = getDayShade(marker(2025, 4, day));
      expect(shade.shaded).toBe(true);
      expect(shade.isSkipped).toBe(true);
    }
  });

  it("shades AND skips Purim and Yom HaAtzma'ut (studio cancel decision)", () => {
    const purim = getDayShade(marker(2025, 3, 14));
    expect(purim.shaded).toBe(true);
    expect(purim.isSkipped).toBe(true);
    const atzmaut = getDayShade(marker(2025, 5, 1));
    expect(atzmaut.shaded).toBe(true);
    expect(atzmaut.isSkipped).toBe(true);
  });

  it('shades but does not skip Shabbat, and keeps the legacy shape', () => {
    const shabbat = getDayShade(marker(2024, 11, 16));
    expect(shabbat).toEqual({ shaded: true, he: 'שבת', en: 'Shabbat', isSkipped: false });
  });

  it('returns not-shaded/not-skipped for a plain midweek day', () => {
    expect(getDayShade(marker(2024, 11, 20))).toEqual({ shaded: false, isSkipped: false });
  });

  it('shades but does not skip modern observances that are normal working days', () => {
    // Yom HaAliyah School Observance (Nov 8 2024), Yitzhak Rabin Memorial Day
    // (Nov 13 2024) and Sigd (Nov 28 2024) are MODERN_HOLIDAY.
    for (const day of [8, 13, 28]) {
      const shade = getDayShade(marker(2024, 11, day));
      expect(shade.shaded).toBe(true);
      expect(shade.isSkipped).toBe(false);
      expect(isHoliday(d(2024, 11, day))).toBe(true);
      expect(isSkippedHoliday(d(2024, 11, day))).toBe(false);
    }
  });

  it('shades but does not skip optional custom fasts', () => {
    // hebcal tags these MINOR_FAST, but they are ordinary Israeli working days:
    // Ta'anit BeHaB (Nov 11/14/18 2024) and Yom Kippur Katan (Nov 28 2024).
    for (const day of [11, 14, 18]) {
      expect(isHoliday(d(2024, 11, day))).toBe(true);
      expect(isSkippedHoliday(d(2024, 11, day))).toBe(false);
      expect(getDayShade(marker(2024, 11, day)).isSkipped).toBe(false);
    }
    expect(isSkippedHoliday(d(2025, 2, 27))).toBe(false); // Yom Kippur Katan Adar
  });

  it('still skips the public fast days', () => {
    expect(isSkippedHoliday(d(2024, 10, 6))).toBe(true); // Tzom Gedaliah
    expect(isSkippedHoliday(d(2025, 1, 10))).toBe(true); // Asara B'Tevet
    expect(isSkippedHoliday(d(2024, 3, 21))).toBe(true); // Ta'anit Esther
    expect(isSkippedHoliday(d(2024, 7, 23))).toBe(true); // Tzom Tammuz
    expect(isSkippedHoliday(d(2024, 8, 13))).toBe(true); // Tish'a B'Av
  });

  it('documents the Chanukah 8th-day nuance: candle days skip, the 8th day does not', () => {
    // hebcal tags Dec 25 2024 – Jan 1 2025 as CHANUKAH_CANDLES and Jan 2 2025 as
    // "Chanukah: 8th Day" (MINOR_HOLIDAY) — shaded, but not in SKIP_FLAGS.
    expect(isSkippedHoliday(d(2025, 1, 1))).toBe(true);
    expect(isHoliday(d(2025, 1, 2))).toBe(true);
    expect(isSkippedHoliday(d(2025, 1, 2))).toBe(false);
  });

  it('SKIP_FLAGS is a strict subset of SHADE_FLAGS', () => {
    expect(SKIP_FLAGS & ~SHADE_FLAGS).toBe(0);
    expect(SKIP_FLAGS).not.toBe(SHADE_FLAGS);
  });
});

describe('public schedule filtering (T-18, T-19, T-27)', () => {
  function event(overrides: Partial<ScheduleEvent> & Pick<ScheduleEvent, 'id' | 'starts_at'>): ScheduleEvent {
    return {
      event_type: 'class',
      title: 'Ballet Beginners',
      ends_at: overrides.starts_at,
      ...overrides,
    } as ScheduleEvent;
  }

  it('T-18 drops a recurring class occurrence on Yom Kippur', () => {
    const events = [
      event({ id: 'offering-1-2024-10-12', starts_at: '2024-10-12T05:00:00Z' }),
      event({ id: 'offering-1-2024-11-15', starts_at: '2024-11-15T06:00:00Z' }),
    ];
    const result = filterHolidayOccurrences(events);
    expect(result.map((e) => e.id)).toEqual(['offering-1-2024-11-15']);
  });

  it('T-19 keeps an explicit offering_session on Yom Kippur (admin override)', () => {
    const events = [
      event({ id: 'session-abc', starts_at: '2024-10-12T05:00:00Z', event_type: 'session' }),
      event({ id: 'offering-1-2024-10-12', starts_at: '2024-10-12T05:00:00Z' }),
    ];
    const result = filterHolidayOccurrences(events);
    expect(result.map((e) => e.id)).toEqual(['session-abc']);
  });

  it('keeps appointments and blocked time untouched', () => {
    const events = [
      event({ id: 'appt-1', starts_at: '2024-10-12T07:00:00Z', event_type: 'appointment' }),
      event({ id: 'block-1', starts_at: '2024-10-12T09:00:00Z', event_type: 'blocked' }),
    ];
    expect(filterHolidayOccurrences(events)).toHaveLength(2);
  });

  it('resolves the civil day in Asia/Jerusalem, not the viewer timezone', () => {
    // 21:00Z on Yom Kippur is already 00:00 the next day in Israel (IDT, UTC+3).
    const events = [event({ id: 'offering-1-late', starts_at: '2024-10-12T21:00:00Z' })];
    expect(filterHolidayOccurrences(events)).toHaveLength(1);
    expect(isSkippedHolidayInIsrael(new Date('2024-10-12T21:00:00Z'))).toBe(false);
    expect(isSkippedHolidayInIsrael(new Date('2024-10-11T21:30:00Z'))).toBe(true);
  });

  it('keeps classes on shaded-only days (Rabin Memorial Day)', () => {
    const events = [event({ id: 'offering-1-2024-11-13', starts_at: '2024-11-13T06:00:00Z' })];
    expect(filterHolidayOccurrences(events)).toHaveLength(1);
  });

  it("drops recurring class occurrences on Purim and Yom HaAtzma'ut (5785)", () => {
    // Purim 5785 = Mar 14 2025, Yom HaAtzma'ut 5785 = May 1 2025
    const events = [
      event({ id: 'offering-1-2025-03-14', starts_at: '2025-03-14T06:00:00Z' }),
      event({ id: 'offering-1-2025-05-01', starts_at: '2025-05-01T06:00:00Z' }),
      event({ id: 'offering-1-2025-03-15', starts_at: '2025-03-15T06:00:00Z' }), // normal Sat after Purim
    ];
    const result = filterHolidayOccurrences(events);
    expect(result.map((e) => e.id)).toEqual(['offering-1-2025-03-15']);
  });

  it('T-27 a weekly class through Sukkot 5785 loses Oct 17–24', () => {
    const weekly = [17, 18, 19, 20, 21, 22, 23, 24, 25].map((day) =>
      event({ id: `offering-1-2024-10-${day}`, starts_at: `2024-10-${day}T06:00:00Z` }),
    );
    const result = filterHolidayOccurrences(weekly);
    expect(result.map((e) => e.id)).toEqual(['offering-1-2024-10-25']);
  });
});
