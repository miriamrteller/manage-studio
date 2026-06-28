import { describe, it, expect } from 'vitest';
import { computeGuardianSetupRequired } from '@/features/enrolment/lib/guardianSetupRequired';

describe('computeGuardianSetupRequired', () => {
  it('requires setup for adult intake when guardian person is missing', () => {
    expect(
      computeGuardianSetupRequired({
        isAdultIntake: true,
        resolveStatus: 'missing_person',
        dateOfBirth: null,
      }),
    ).toBe(true);
  });

  it('requires setup for adult intake when guardian has no date of birth', () => {
    expect(
      computeGuardianSetupRequired({
        isAdultIntake: true,
        resolveStatus: 'found',
        dateOfBirth: null,
      }),
    ).toBe(true);
  });

  it('does not require setup for adult intake when guardian has date of birth', () => {
    expect(
      computeGuardianSetupRequired({
        isAdultIntake: true,
        resolveStatus: 'found',
        dateOfBirth: '1988-03-15',
      }),
    ).toBe(false);
  });

  it('does not require setup for minor classes when guardian person is missing', () => {
    expect(
      computeGuardianSetupRequired({
        isAdultIntake: false,
        resolveStatus: 'missing_person',
        dateOfBirth: null,
      }),
    ).toBe(false);
  });
});
