/**
 * DL-HOLIDAY-001 — edge-function holiday filter (`supabase/functions/_shared/holidays.ts`).
 * Covers spec test IDs T-20, T-21, T-22 as runnable unit tests (the Deno mirror lives in
 * supabase/functions/get-available-slots/index.test.ts; only Vitest runs in CI today).
 * Run: pnpm -C apps/web test holiday-slot-filter.test.ts
 *
 * Note: the spec's §6 verification date for Rosh Hashana 5786 is 2025-09-23.
 * 2025-10-03 (quoted elsewhere in the spec) is the Friday after Yom Kippur and is NOT
 * a holiday — verified against @hebcal/core.
 */
import { describe, it, expect } from 'vitest';
import {
  SHADE_FLAGS as EDGE_SHADE_FLAGS,
  SKIP_FLAGS as EDGE_SKIP_FLAGS,
  filterHolidayDates,
  holidayNamesOnIsoDate,
  isHoliday as edgeIsHoliday,
  isHolidayIsoDate,
  isSkippedHolidayIsoDate,
} from '../../../../supabase/functions/_shared/holidays.ts';
import {
  SHADE_FLAGS,
  SKIP_FLAGS,
  isHoliday as sharedIsHoliday,
  isSkippedHoliday as sharedIsSkippedHoliday,
} from '@shared/lib/holidays';

describe('edge holiday detection (T-20, T-21)', () => {
  it('T-20 Rosh Hashana 5786 (2025-09-23) is a holiday → no bookable slots', () => {
    expect(edgeIsHoliday(new Date('2025-09-23'))).toBe(true);
    expect(isHolidayIsoDate('2025-09-23')).toBe(true);
    expect(holidayNamesOnIsoDate('2025-09-23')[0]).toMatch(/Rosh Hashana/i);
  });

  it('T-21 a regular day (2024-11-15) is bookable', () => {
    expect(edgeIsHoliday(new Date('2024-11-15'))).toBe(false);
    expect(isHolidayIsoDate('2024-11-15')).toBe(false);
  });

  it('is timezone-independent for UTC-midnight dates', () => {
    expect(edgeIsHoliday(new Date('2025-10-02T00:00:00Z'))).toBe(true); // Yom Kippur 5786
    expect(edgeIsHoliday(new Date('2025-10-03T00:00:00Z'))).toBe(false); // plain Friday
  });

  it('rejects malformed dates instead of throwing', () => {
    expect(isHolidayIsoDate('not-a-date')).toBe(false);
    expect(holidayNamesOnIsoDate('2025-9-23')).toEqual([]);
  });
});

describe('filterHolidayDates — offering_sessions overrides (T-22)', () => {
  const window = [
    '2025-09-22', // Erev Rosh Hashana — bookable (eves are shaded, never skipped)
    '2025-09-23', // Rosh Hashana I
    '2025-09-24', // Rosh Hashana II
    // 2025-09-25 is Tzom Gedaliah (MINOR_FAST) and would also be skipped — omitted.
    '2025-09-26', // regular Friday
  ];

  it('drops holiday dates when there is no override', () => {
    expect(filterHolidayDates(window, [])).toEqual(['2025-09-22', '2025-09-26']);
  });

  it('T-22 keeps a holiday date that has an explicit offering_session', () => {
    expect(filterHolidayDates(window, ['2025-09-24'])).toEqual([
      '2025-09-22',
      '2025-09-24',
      '2025-09-26',
    ]);
  });

  it('keeps Chanukah dates only where an override exists', () => {
    const chanukah = ['2024-12-27', '2024-12-28', '2024-12-29'];
    expect(filterHolidayDates(chanukah, ['2024-12-28'])).toEqual(['2024-12-28']);
  });

  it('returns an empty list when the whole window is holidays', () => {
    expect(filterHolidayDates(['2025-09-23', '2025-09-24'], [])).toEqual([]);
  });

  it('preserves input order and ignores irrelevant overrides', () => {
    expect(filterHolidayDates(window, ['2030-01-01'])).toEqual(['2025-09-22', '2025-09-26']);
  });
});

describe('edge and shared modules must not drift', () => {
  it('uses identical flag masks', () => {
    expect(EDGE_SHADE_FLAGS).toBe(SHADE_FLAGS);
    expect(EDGE_SKIP_FLAGS).toBe(SKIP_FLAGS);
  });

  it('agrees on every day of a full school year (Sep 2025 – Jun 2026)', () => {
    const cursor = new Date(Date.UTC(2025, 8, 1));
    const last = Date.UTC(2026, 5, 30);
    let shadedCount = 0;
    let skippedCount = 0;
    while (cursor.getTime() <= last) {
      const iso = cursor.toISOString().slice(0, 10);
      const civil = new Date(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
      expect(isHolidayIsoDate(iso), `shade mismatch on ${iso}`).toBe(sharedIsHoliday(civil));
      expect(isSkippedHolidayIsoDate(iso), `skip mismatch on ${iso}`).toBe(
        sharedIsSkippedHoliday(civil),
      );
      if (isHolidayIsoDate(iso)) shadedCount += 1;
      if (isSkippedHolidayIsoDate(iso)) skippedCount += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // 59 shaded observances, of which 33 remove classes/slots — the Yom Tov / Chol
    // HaMoed / Chanukah / public-fast days plus the two studio closures (Purim,
    // Yom HaAtzma'ut) added by ALWAYS_SKIPPED_DESCS on 2026-08-06. The other 26 are
    // shaded-only: national days (Yom HaShoah, Yom HaZikaron, Yom Yerushalayim,
    // Rabin/Herzl/Ben-Gurion Day, Sigd, Family Day, Hebrew Language Day), minor
    // holidays (Shushan Purim, Tu BiShvat, Lag BaOmer, Pesach Sheni, Chanukah's 8th
    // day, Leil Selichot) and optional fasts (Yom Kippur Katan, Ta'anit BeHaB).
    expect(shadedCount).toBe(59);
    expect(skippedCount).toBe(33);
  });

  it('skips exactly the Yom Tov / Chol HaMoed / Chanukah / public-fast days of 5786', () => {
    for (const iso of [
      '2025-09-23', // Rosh Hashana I
      '2025-09-25', // Tzom Gedaliah
      '2025-10-02', // Yom Kippur
      '2025-10-13', // Hoshana Raba
      '2025-12-14', // Chanukah, 1 candle
      '2025-12-30', // Asara B'Tevet
      '2026-04-01', // Ta'anit Bechorot / Erev Pesach
      '2026-04-08', // Pesach VII
      '2026-05-22', // Shavuot
      '2026-03-03', // Purim — studio cancel decision (2026-08-06)
      '2026-04-22', // Yom HaAtzma'ut — studio cancel decision (2026-08-06)
    ]) {
      expect(isSkippedHolidayIsoDate(iso), `expected ${iso} to be skipped`).toBe(true);
    }
    for (const iso of [
      '2025-12-22', // Chanukah 8th day (MINOR_HOLIDAY)
      '2026-02-02', // Tu BiShvat
      '2026-05-05', // Lag BaOmer
      '2025-11-20', // Sigd + Yom Kippur Katan
      '2026-04-30', // Ta'anit BeHaB
    ]) {
      expect(isSkippedHolidayIsoDate(iso), `expected ${iso} to stay bookable`).toBe(false);
      expect(isHolidayIsoDate(iso), `expected ${iso} to be shaded`).toBe(true);
    }
  });
});
