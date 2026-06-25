import { describe, it, expect } from 'vitest';
import {
  evaluateAgeEnrolment,
  shouldBlockAgeEnrolment,
} from '@/features/enrolment/lib/ageEnrolmentPolicy';

/** Summer 2026 season start from seed.sql */
const SEASON_START = '2026-05-01';
const MINI_BAND = { min_age: 3, max_age: 4 };

/** Age 5 at season start — ineligible for Mini (3–4). */
const INELIGIBLE_DOB = '2021-04-01';
/** Age 3 at season start — eligible for Mini. */
const ELIGIBLE_DOB = '2022-05-02';

describe('ageEnrolmentPolicy', () => {
  describe('shouldBlockAgeEnrolment', () => {
    const ineligibleDecision = evaluateAgeEnrolment({
      dateOfBirth: INELIGIBLE_DOB,
      ageBand: MINI_BAND,
      seasonStartDate: SEASON_START,
      actor: 'guest',
    });

    it('blocks guest when ineligible and no override', () => {
      expect(shouldBlockAgeEnrolment(ineligibleDecision, 'guest')).toBe(true);
    });

    it('blocks parent when ineligible and no override', () => {
      expect(shouldBlockAgeEnrolment(ineligibleDecision, 'parent')).toBe(true);
    });

    it('blocks admin when ineligible and no override', () => {
      expect(shouldBlockAgeEnrolment(ineligibleDecision, 'admin')).toBe(true);
    });

    it('does not block admin when ineligible but override confirmed', () => {
      expect(shouldBlockAgeEnrolment(ineligibleDecision, 'admin', true)).toBe(false);
    });

    it('does not block admin when eligible', () => {
      const eligibleDecision = evaluateAgeEnrolment({
        dateOfBirth: ELIGIBLE_DOB,
        ageBand: MINI_BAND,
        seasonStartDate: SEASON_START,
        actor: 'admin',
      });
      expect(shouldBlockAgeEnrolment(eligibleDecision, 'admin')).toBe(false);
    });

    it('does not block when season start is missing (canValidate false)', () => {
      const decision = evaluateAgeEnrolment({
        dateOfBirth: INELIGIBLE_DOB,
        ageBand: MINI_BAND,
        seasonStartDate: null,
        actor: 'guest',
      });
      expect(decision.canValidate).toBe(false);
      expect(shouldBlockAgeEnrolment(decision, 'guest')).toBe(false);
    });
  });
});
