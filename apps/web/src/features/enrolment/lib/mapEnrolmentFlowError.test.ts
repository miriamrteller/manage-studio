import { describe, expect, it } from 'vitest';
import { mapEnrolmentFlowError } from './mapEnrolmentFlowError';

describe('mapEnrolmentFlowError', () => {
  const t = (key: string) => key;

  it('maps duplicate enrolment errors to translated copy', () => {
    expect(
      mapEnrolmentFlowError(
        new Error('Person already enrolled in this class for this term'),
        t,
        'parent',
      ),
    ).toBe('pages.enrolment.already_enrolled_preselected');
  });

  it('uses admin copy in admin mode', () => {
    expect(
      mapEnrolmentFlowError(
        new Error('EnrolmentService.create failed after 3 retries: Person already enrolled in this class for this term'),
        t,
        'admin',
      ),
    ).toBe('pages.enrolment.already_enrolled_preselected_admin');
  });
});
