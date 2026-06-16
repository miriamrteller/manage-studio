import { describe, expect, it } from 'vitest';
import {
  isPendingEnrolmentActionStatus,
  resolvePendingEnrolmentAction,
} from '@/features/enrolment/lib/pendingEnrolmentAction';

const ENGAGEMENT_ID = '00000000-0000-0000-0000-000000000301';

describe('resolvePendingEnrolmentAction', () => {
  it('routes pending_payment to the pay completion page', () => {
    const action = resolvePendingEnrolmentAction('pending_payment', ENGAGEMENT_ID);
    expect(action).toEqual({
      kind: 'complete_payment',
      path: `/enrol/pay/${ENGAGEMENT_ID}`,
    });
  });

  it('routes pending_waiver to the waiver completion page', () => {
    const action = resolvePendingEnrolmentAction('pending_waiver', ENGAGEMENT_ID);
    expect(action).toEqual({
      kind: 'complete_waiver',
      path: `/enrol/complete?engagementId=${ENGAGEMENT_ID}`,
    });
  });

  it('returns null for active enrolments', () => {
    expect(resolvePendingEnrolmentAction('active', ENGAGEMENT_ID)).toBeNull();
  });

  it('identifies actionable pending statuses', () => {
    expect(isPendingEnrolmentActionStatus('pending_payment')).toBe(true);
    expect(isPendingEnrolmentActionStatus('pending_waiver')).toBe(true);
    expect(isPendingEnrolmentActionStatus('active')).toBe(false);
  });
});
