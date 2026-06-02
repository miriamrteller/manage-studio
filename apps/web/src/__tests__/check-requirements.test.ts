import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ageAt,
  filterClassesByAge,
  formatAgeRange,
  formatLevelWithAge,
  isAgeEligible,
  anyClassHasAgeBand,
} from '@/features/enrolment/lib/check-requirements';
import { parseLocalDate } from '@/lib/personAge';

/** Summer 2026 season start from seed.sql */
const SEASON_START = '2026-05-01';
const seasonRef = parseLocalDate(SEASON_START);

describe('check-requirements', () => {
  describe('ageAt', () => {
    it('computes age from YYYY-MM-DD without UTC drift', () => {
      const ref = new Date(2026, 4, 26); // May 26 2026 local
      expect(ageAt('2022-05-27', ref)).toBe(3);
      expect(ageAt('2022-05-26', ref)).toBe(4);
      expect(ageAt('2022-05-25', ref)).toBe(4);
    });

    it('returns NaN for invalid dates', () => {
      expect(Number.isNaN(ageAt('invalid'))).toBe(true);
    });
  });

  describe('isAgeEligible', () => {
    const mini = { min_age: 3, max_age: 4 };
    const pilates = { min_age: 18, max_age: null };

    it('allows all classes when DOB is unknown', () => {
      expect(isAgeEligible(mini, {})).toBe(true);
    });

    it('filters by age at season start, not today', () => {
      const person = { date_of_birth: '2022-05-02' };
      // Age 3 at season start (May 1), but 4 by late May
      expect(ageAt(person.date_of_birth!, seasonRef)).toBe(3);
      expect(ageAt(person.date_of_birth!, new Date(2026, 4, 26))).toBe(4);

      expect(
        isAgeEligible(mini, person, { referenceDate: SEASON_START }),
      ).toBe(true);
      expect(
        isAgeEligible({ min_age: 4, max_age: 6 }, person, { referenceDate: SEASON_START }),
      ).toBe(false);
    });

    it('filters age 4 to Mini only among seeded bands at season start', () => {
      const person = { date_of_birth: '2022-05-01' };
      expect(ageAt(person.date_of_birth!, seasonRef)).toBe(4);
      expect(isAgeEligible(mini, person, { referenceDate: SEASON_START })).toBe(true);
      expect(isAgeEligible({ min_age: 4, max_age: 6 }, person, { referenceDate: SEASON_START })).toBe(true);
      expect(isAgeEligible({ min_age: 5, max_age: 7 }, person, { referenceDate: SEASON_START })).toBe(false);
    });

    it('treats open-ended max_age as no upper bound', () => {
      const adult = { date_of_birth: '1988-03-15' };
      expect(isAgeEligible(pilates, adult, { referenceDate: SEASON_START })).toBe(true);
    });

    it('excludes classes with no age band when DOB is known', () => {
      const person = { date_of_birth: '2018-01-01' };
      expect(isAgeEligible({ min_age: null, max_age: null }, person, { referenceDate: SEASON_START })).toBe(false);
    });

    it('uses season_start_date on the class when provided', () => {
      const person = { date_of_birth: '2022-05-02' };
      expect(
        isAgeEligible(
          { min_age: 4, max_age: 6, season_start_date: SEASON_START },
          person,
        ),
      ).toBe(false);
    });
  });

  describe('filterClassesByAge', () => {
    const classes = [
      { id: 'mini', min_age: 3, max_age: 4, season_start_date: SEASON_START },
      { id: 'pre', min_age: 4, max_age: 6, season_start_date: SEASON_START },
      { id: 'primary', min_age: 5, max_age: 7, season_start_date: SEASON_START },
    ];

    it('does not filter when DOB is missing', () => {
      const { classes: result, ageFilteringActive } = filterClassesByAge(classes, {});
      expect(result).toHaveLength(3);
      expect(ageFilteringActive).toBe(false);
    });

    it('filters to eligible classes for age 4 at season start', () => {
      const { classes: result, ageFilteringActive } = filterClassesByAge(classes, {
        date_of_birth: '2022-05-01',
      });
      expect(ageFilteringActive).toBe(true);
      expect(result.map((c) => c.id)).toEqual(['mini', 'pre']);
    });

    it('does not filter when no class has age bands', () => {
      const noBands = [{ id: 'a' }, { id: 'b' }];
      const { ageFilteringActive } = filterClassesByAge(noBands, {
        date_of_birth: '2020-01-01',
      });
      expect(ageFilteringActive).toBe(false);
    });
  });

  describe('format helpers', () => {
    it('formats age ranges', () => {
      expect(formatAgeRange(3, 4)).toBe('3–4');
      expect(formatAgeRange(18, null)).toBe('18+');
    });

    it('formats level with ages', () => {
      expect(formatLevelWithAge('Mini', 3, 4)).toBe('Mini (ages 3–4)');
    });
  });
});

describe('seed.sql snapshot', () => {
  const seedPath = resolve(__dirname, '../../../../supabase/seed.sql');
  const seed = readFileSync(seedPath, 'utf8');

  it('defines 7 Monday classes at 24000 agorot', () => {
    const classBlocks = seed.match(/'Mini'|'Pre-Primary'|'Primary'|'Grade 1'|'Grade 2'|'Grade 3'|'Pilates'/g);
    expect(classBlocks).toHaveLength(7);

    const mondayRows = (seed.match(/,\s*1,\s*'\d{2}:\d{2}:\d{2}'/g) ?? []).length;
    expect(mondayRows).toBeGreaterThanOrEqual(7);

    const priceMatches = seed.match(/24000,\s*'ILS'/g) ?? [];
    expect(priceMatches.length).toBeGreaterThanOrEqual(7);
  });

  it('includes parent test account and seed children', () => {
    expect(seed).toContain('miriamrstern@gmail.com');
    expect(seed).toContain('miriamrteller@gmail.com');
    expect(anyClassHasAgeBand([{ min_age: 3, max_age: 4 }])).toBe(true);
  });
});
