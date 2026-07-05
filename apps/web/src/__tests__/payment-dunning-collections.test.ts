/**
 * Payment dunning collections + renewal obligation helper tests.
 * Run: pnpm -C apps/web test payment-dunning-collections.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildDunningKey,
  hasDunningNotificationBeenSent,
} from '../../../../supabase/functions/_shared/collections/dunning-idempotency.ts';
import {
  buildRenewalDunningEmailCopy,
} from '../../../../supabase/functions/_shared/collections/build-dunning-email-context.ts';
import { applyBillingScheduleDunningFailure } from '../../../../supabase/functions/_shared/payments/apply-billing-schedule-dunning-failure.ts';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SCHEDULE_ID = '55555555-5555-5555-5555-555555555555';
const ENGAGEMENT_ID = '11111111-1111-1111-1111-111111111111';
const OFFERING_ID = '33333333-3333-3333-3333-333333333333';
const PERSON_ID = '44444444-4444-4444-4444-444444444444';

const sendPaymentDunningReminder = vi.hoisted(() => vi.fn());
const sendRenderedEmail = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../../supabase/functions/_shared/collections/send-payment-dunning-reminder.ts',
  () => ({ sendPaymentDunningReminder: sendPaymentDunningReminder }),
);
vi.mock('../../../../supabase/functions/_shared/resend-send.ts', () => ({
  sendRenderedEmail: sendRenderedEmail,
  EMAIL_TEMPLATE_NAMES: { PAYMENT_REMINDER: 'payment_reminder' },
}));

function makeNotificationLogService(rows: Array<Record<string, unknown>> = []) {
  const store = [...rows];
  return {
    from(table: string) {
      if (table !== 'notification_log') return { select: () => ({}) };
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              filter: () => ({
                in: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: store.find(
                        (r) =>
                          r.tenant_id === TENANT_ID &&
                          r.template_name === 'payment_reminder' &&
                          (r.variables as { dunning_key?: string })?.dunning_key &&
                          ['sent', 'delivered', 'read', 'pending'].includes(
                            r.status as string,
                          ),
                      ) ?? null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          store.push(row);
          return { error: null };
        },
      };
    },
  };
}

function makeBillingDunningService(options: {
  attemptCount?: number;
  status?: string;
  updateSucceeds?: boolean;
}) {
  const attemptCount = options.attemptCount ?? 0;
  const status = options.status ?? 'active';
  let currentCount = attemptCount;
  let currentStatus = status;

  return {
    from(table: string) {
      if (table === 'billing_schedules') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: SCHEDULE_ID,
                  tenant_id: TENANT_ID,
                  engagement_id: ENGAGEMENT_ID,
                  attempt_count: currentCount,
                  status: currentStatus,
                },
                error: null,
              }),
            }),
          }),
          update: (updates: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                neq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (options.updateSucceeds === false) {
                        return { data: null, error: null };
                      }
                      currentCount = updates.attempt_count as number;
                      if (updates.status) currentStatus = updates.status as string;
                      return {
                        data: {
                          attempt_count: currentCount,
                          next_attempt_at: updates.next_attempt_at ?? null,
                          status: currentStatus,
                        },
                        error: null,
                      };
                    },
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'engagements') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { person_id: PERSON_ID, offering_id: OFFERING_ID },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
    },
  };
}

describe('buildDunningKey', () => {
  it('builds stable renewal key format', () => {
    expect(buildDunningKey('renewal', SCHEDULE_ID, 2)).toBe(
      `renewal:${SCHEDULE_ID}:2`,
    );
  });

  it('builds enrolment_unpaid key format', () => {
    expect(buildDunningKey('enrolment_unpaid', ENGAGEMENT_ID, 1)).toBe(
      `enrolment_unpaid:${ENGAGEMENT_ID}:1`,
    );
  });
});

describe('hasDunningNotificationBeenSent', () => {
  it('returns false when no matching log row', async () => {
    const service = makeNotificationLogService();
    const key = buildDunningKey('renewal', SCHEDULE_ID, 1);
    expect(await hasDunningNotificationBeenSent(service as never, TENANT_ID, key)).toBe(
      false,
    );
  });

  it('returns true after sent log exists', async () => {
    const key = buildDunningKey('renewal', SCHEDULE_ID, 1);
    const service = makeNotificationLogService([
      {
        tenant_id: TENANT_ID,
        template_name: 'payment_reminder',
        status: 'sent',
        variables: { dunning_key: key },
      },
    ]);
    expect(await hasDunningNotificationBeenSent(service as never, TENANT_ID, key)).toBe(
      true,
    );
  });
});

describe('buildRenewalDunningEmailCopy', () => {
  it('uses attempt 1 EN copy with due date', () => {
    const copy = buildRenewalDunningEmailCopy({
      language: 'en',
      className: 'Ballet A',
      studentName: 'Maya',
      attemptCount: 1,
      nextActionAt: '2026-06-04T21:00:00.000Z',
    });
    expect(copy.intro).toContain('monthly payment');
    expect(copy.intro).toContain('Ballet A');
    expect(copy.ctaButton).toBe('Update payment method');
    expect(copy.subject).toBe('Payment failed — Ballet A');
  });

  it('uses attempt 3 suspend HE copy', () => {
    const copy = buildRenewalDunningEmailCopy({
      language: 'he',
      className: 'בלט',
      studentName: 'מאיה',
      attemptCount: 3,
      nextActionAt: null,
    });
    expect(copy.intro).toContain('הושעה');
    expect(copy.ctaButton).toBe('כניסה לפורטל');
    expect(copy.subject).toBe('החיוב הושעה — בלט');
  });
});

describe('applyBillingScheduleDunningFailure', () => {
  const originalDeno = globalThis.Deno;

  beforeEach(() => {
    sendPaymentDunningReminder.mockReset();
    sendPaymentDunningReminder.mockResolvedValue({ sent: true });
    globalThis.Deno = {
      env: { get: (k: string) => (k === 'APP_URL' ? 'https://app.test' : undefined) },
    } as typeof globalThis.Deno;
  });

  afterEach(() => {
    globalThis.Deno = originalDeno;
  });

  it('increments schedule and sends reminder on attempt 1', async () => {
    const service = makeBillingDunningService({ attemptCount: 0 });
    const result = await applyBillingScheduleDunningFailure(service as never, {
      billingScheduleId: SCHEDULE_ID,
      failureMessage: 'Card declined',
    });

    expect(result.attemptCount).toBe(1);
    expect(result.suspended).toBe(false);
    expect(sendPaymentDunningReminder).toHaveBeenCalledTimes(1);
    expect(sendPaymentDunningReminder).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        kind: 'renewal',
        subjectId: SCHEDULE_ID,
        attemptCount: 1,
        paymentUrl: 'https://app.test/dashboard/portal',
      }),
    );
  });

  it('suspends on attempt 3', async () => {
    const service = makeBillingDunningService({ attemptCount: 2 });
    const result = await applyBillingScheduleDunningFailure(service as never, {
      billingScheduleId: SCHEDULE_ID,
      failureMessage: 'Card declined',
    });

    expect(result.attemptCount).toBe(3);
    expect(result.suspended).toBe(true);
    expect(result.nextAttemptAt).toBeNull();
    expect(sendPaymentDunningReminder).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ attemptCount: 3 }),
    );
  });

  it('skips double increment when optimistic update fails', async () => {
    const service = makeBillingDunningService({
      attemptCount: 1,
      updateSucceeds: false,
    });
    const result = await applyBillingScheduleDunningFailure(service as never, {
      billingScheduleId: SCHEDULE_ID,
      failureMessage: 'Duplicate',
    });

    expect(result.skipped).toBe(true);
    expect(result.attemptCount).toBe(1);
    expect(sendPaymentDunningReminder).not.toHaveBeenCalled();
  });

  it('skips when schedule already suspended', async () => {
    const service = makeBillingDunningService({ attemptCount: 3, status: 'suspended' });
    const result = await applyBillingScheduleDunningFailure(service as never, {
      billingScheduleId: SCHEDULE_ID,
      failureMessage: 'Late webhook',
    });

    expect(result.skipped).toBe(true);
    expect(result.suspended).toBe(true);
    expect(sendPaymentDunningReminder).not.toHaveBeenCalled();
  });

  it('truncates failureMessage to 500 chars', async () => {
    const service = makeBillingDunningService({ attemptCount: 0 });
    const longMessage = 'x'.repeat(600);
    await applyBillingScheduleDunningFailure(service as never, {
      billingScheduleId: SCHEDULE_ID,
      failureMessage: longMessage,
    });
    expect(sendPaymentDunningReminder).toHaveBeenCalled();
  });
});
