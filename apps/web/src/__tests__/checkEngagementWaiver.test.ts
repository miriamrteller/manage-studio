import { describe, expect, it } from 'vitest';

const MINOR_AGE_MS = 18 * 365.25 * 24 * 60 * 60 * 1000;

function isMinorDateOfBirth(dateOfBirth: string | null | undefined): boolean {
  if (!dateOfBirth) return false;
  return new Date(dateOfBirth) > new Date(Date.now() - MINOR_AGE_MS);
}

describe('enrolment waiver gate helpers', () => {
  it('treats Esther Stern DOB as a minor', () => {
    expect(isMinorDateOfBirth('2021-05-15')).toBe(true);
  });

  it('treats adult DOB as not minor', () => {
    expect(isMinorDateOfBirth('1988-03-15')).toBe(false);
  });
});
