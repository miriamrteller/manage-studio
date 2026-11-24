/** Cancelling a shoot: which pay links stop, and how much was already paid. */
import { describe, expect, it } from 'vitest';
import { planJobCancellation } from '../../../../supabase/functions/_shared/jobs/cancel-job-plan.ts';

describe('planJobCancellation', () => {
  it('cancels open pay links and leaves paid ones alone', () => {
    const plan = planJobCancellation([
      { id: 'dep', status: 'paid', amount_minor: 30000 },
      { id: 'bal', status: 'sent', amount_minor: 70000 },
      { id: 'extra', status: 'pending', amount_minor: 5000 },
      { id: 'old', status: 'cancelled', amount_minor: 1000 },
      { id: 'back', status: 'refunded_manual', amount_minor: 2000 },
    ]);
    expect(plan).toEqual({ cancelRequestIds: ['bal', 'extra'], paidMinor: 30000 });
  });

  it('handles a shoot with no payments', () => {
    expect(planJobCancellation([])).toEqual({ cancelRequestIds: [], paidMinor: 0 });
  });
});
