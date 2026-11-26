// @vitest-environment jsdom
/**
 * A studio's own website links each class straight to enrolment:
 * /enrol?class=<offering id>&term=<season id> opens the wizard with that class picked.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { intentFromSearch, readEnrollmentIntent } from '../lib/enrollment-intent';

const CLASS = 'fd02732d-5c0b-4f65-ae12-de1b77a94992';
const TERM = '331b0706-e502-4af4-80f1-d62a392c492f';

describe('enrol link with a class', () => {
  beforeEach(() => sessionStorage.clear());

  it('reads the class and term from the link', () => {
    expect(intentFromSearch(`?class=${CLASS}&term=${TERM}`)).toEqual({ classId: CLASS, seasonId: TERM });
    expect(readEnrollmentIntent(null, `?class=${CLASS}&term=${TERM}`)).toEqual({ classId: CLASS, seasonId: TERM });
  });

  it('class without a term still picks the class', () => {
    expect(intentFromSearch(`?class=${CLASS}`)).toEqual({ classId: CLASS });
  });

  it('ignores anything that is not an id', () => {
    expect(intentFromSearch('?class=<script>')).toBeNull();
    expect(intentFromSearch(`?class=${CLASS}&term=oops`)).toEqual({ classId: CLASS });
    expect(intentFromSearch('')).toBeNull();
    expect(intentFromSearch('?src=website')).toBeNull();
  });

  it('route state wins over the link; the link wins over an old stored intent', () => {
    const other = '11bbd279-f678-4f99-a3d8-3c7b1b688a2f';
    expect(readEnrollmentIntent({ classId: other }, `?class=${CLASS}`)).toEqual({ classId: other });
    sessionStorage.setItem('enrollmentIntent', JSON.stringify({ classId: other }));
    expect(readEnrollmentIntent(null, `?class=${CLASS}`)).toEqual({ classId: CLASS });
    expect(readEnrollmentIntent(null, '')).toEqual({ classId: other });
  });
});
