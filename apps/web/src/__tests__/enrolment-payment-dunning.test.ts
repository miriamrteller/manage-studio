/**
 * Enrolment unpaid payment dunning obligation tests.
 * Run: pnpm -C apps/web test enrolment-payment-dunning.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEnrolmentPaymentDunningStep } from '../../../../supabase/functions/_shared/collections/apply-enrolment-payment-dunning-step.ts';
import {
  enrolmentDunningActionDueAt,
} from '../../../../supabase/functions/_shared/collections/enrolment-dunning-time.ts';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ENGAGEMENT_ID = '11111111-1111-1111-1111-111111111111';
const OFFERING_ID = '33333333-3333-3333-3333-333333333333';
const PERSON_ID = '44444444-4444-4444-4444-444444444444';
const CREATED_AT = '2026-06-01T10:00:00.000Z';

const sendPaymentDunningReminder = vi.hoisted(() => vi.fn());
const sendRenderedEmail = vi.hoisted(() => vi.fn());
const buildEnrolmentPayUrl = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../../supabase/functions/_shared/collections/send-payment-dunning-reminder.ts',
  () => ({ sendPaymentDunningReminder: sendPaymentDunningReminder }),
);
vi.mock('../../../../supabase/functions/_shared/enrolment-pay-url.ts', () => ({
  buildEnrolmentPayUrl: buildEnrolmentPayUrl,
}));
vi.mock('../../../../supabase/functions/_shared/resend-send.ts', () => ({
  sendRenderedEmail: sendRenderedEmail,
  EMAIL_TEMPLATE_NAMES: {
    PAYMENT_REMINDER: 'payment_reminder',
    CLASS_CANCELLATION: 'class_cancellation',
  },
}));
vi.mock('../../../../supabase/functions/_shared/notification-from.ts', () => ({
  resolveNotificationFromEmail: () => 'noreply@test.com',
}));

type EngagementState = {
  status: string;
  payment_dunning_attempt_count: number;
  payment_dunning_next_at: string | null;
  created_at: string;
  cancellation_reason?: string | null;
};

function makeEnrolmentDunningService(initial: Partial<EngagementState> = {}) {
  const state: EngagementState = {
    status: 'pending_payment',
    payment_dunning_attempt_count: 0,
    payment_dunning_next_at: null,
    created_at: CREATED_AT,
    ...initial,
  };

  const auditInserts: Record<string, unknown>[] = [];
  const notificationInserts: Record<string, unknown>[] = [];
  let concurrentBlocked = false;

  const service = {
    state,
    auditInserts,
    notificationInserts,
    setConcurrentBlocked(value: boolean) {
      concurrentBlocked = value;
    },
    from(table: string) {
      if (table === 'engagements') {
        const engagementSelect = async () => ({
          data: {
            id: ENGAGEMENT_ID,
            tenant_id: TENANT_ID,
            person_id: PERSON_ID,
            offering_id: OFFERING_ID,
            ...state,
          },
          error: null,
        });

        const applyUpdate = (updates: Record<string, unknown>) => {
          if (concurrentBlocked) return { data: null, error: null };
          Object.assign(state, updates);
          return {
            data: {
              id: ENGAGEMENT_ID,
              tenant_id: TENANT_ID,
              person_id: PERSON_ID,
              offering_id: OFFERING_ID,
            },
            error: null,
          };
        };

        return {
          select: () => ({
            eq: () => ({
              single: engagementSelect,
              maybeSingle: async () => ({ data: { status: state.status }, error: null }),
            }),
          }),
          update: (updates: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => applyUpdate(updates),
                  }),
                  maybeSingle: async () => applyUpdate(updates),
                }),
                select: () => ({
                  maybeSingle: async () => applyUpdate(updates),
                }),
              }),
              select: () => ({
                maybeSingle: async () =>
                  applyUpdate(updates).data
                    ? { data: { payment_dunning_next_at: updates.payment_dunning_next_at }, error: null }
                    : { data: null, error: null },
              }),
            }),
          }),
        };
      }

      if (table === 'people') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    email: 'parent@test.com',
                    name: 'Parent',
                    account_id: null,
                    user_profile_id: null,
                  },
                  error: null,
                }),
                maybeSingle: async () => ({
                  data: { name: 'Parent' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'offerings') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: { name: 'Ballet A', price_minor: 35000, currency: 'ILS' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  name: 'Studio',
                  currency: 'ILS',
                  from_email: 'studio@test.com',
                  language_default: 'en',
                  primary_color: '#000',
                  accent_color: '#fff',
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            auditInserts.push(row);
            return { error: null };
          },
        };
      }

      if (table === 'notification_log') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                filter: () => ({
                  in: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: async (row: Record<string, unknown>) => {
            notificationInserts.push(row);
            return { error: null };
          },
        };
      }

      if (table === 'contact_preferences') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { email_opted_in: false }, error: null }),
              }),
            }),
          }),
        };
      }

      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
    },
  };

  return service;
}

describe('applyEnrolmentPaymentDunningStep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendPaymentDunningReminder.mockReset();
    sendPaymentDunningReminder.mockResolvedValue({ sent: true });
    sendRenderedEmail.mockReset();
    sendRenderedEmail.mockResolvedValue({ id: 'email-1' });
    buildEnrolmentPayUrl.mockReset();
    buildEnrolmentPayUrl.mockResolvedValue({
      paymentUrl: 'https://app.test/enrol/pay/1?t=token',
      linkExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips when not pending_payment', async () => {
    const service = makeEnrolmentDunningService({ status: 'active' });
    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );
    expect(result).toEqual({ outcome: 'skipped', reason: 'not_pending_payment' });
  });

  it('sends day 3 reminder and sets attempt 1', async () => {
    vi.setSystemTime(new Date(enrolmentDunningActionDueAt(CREATED_AT, 1)));
    const service = makeEnrolmentDunningService({
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 1),
    });

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );

    expect(result).toEqual({ outcome: 'reminded', attemptCount: 1 });
    expect(service.state.payment_dunning_attempt_count).toBe(1);
    expect(sendPaymentDunningReminder).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ kind: 'enrolment_unpaid', attemptCount: 1 }),
    );
  });

  it('sends day 7 urgent reminder as attempt 2', async () => {
    vi.setSystemTime(new Date(enrolmentDunningActionDueAt(CREATED_AT, 2)));
    const service = makeEnrolmentDunningService({
      payment_dunning_attempt_count: 1,
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 2),
    });

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );

    expect(result).toEqual({ outcome: 'reminded', attemptCount: 2 });
    expect(sendPaymentDunningReminder).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ attemptCount: 2 }),
    );
  });

  it('catch-up day 14 count 0 cancels without day 3 email', async () => {
    vi.setSystemTime(new Date(enrolmentDunningActionDueAt(CREATED_AT, 3)));
    const service = makeEnrolmentDunningService({
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 1),
    });

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );

    expect(result).toEqual({ outcome: 'cancelled', attemptCount: 3 });
    expect(service.state.status).toBe('cancelled');
    expect(sendPaymentDunningReminder).not.toHaveBeenCalled();
    expect(sendRenderedEmail).toHaveBeenCalled();
    expect(service.auditInserts.some((a) => a.action === 'engagement.dunning_cancelled')).toBe(true);
  });

  it('cancels on day 14 from count 2', async () => {
    vi.setSystemTime(new Date(enrolmentDunningActionDueAt(CREATED_AT, 3)));
    const service = makeEnrolmentDunningService({
      payment_dunning_attempt_count: 2,
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 3),
    });

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );

    expect(result).toEqual({ outcome: 'cancelled', attemptCount: 3 });
    expect(service.state.cancellation_reason).toBe('payment_dunning_exhausted');
  });

  it('skips when not due yet', async () => {
    vi.setSystemTime(new Date('2026-06-02T21:00:00.000Z'));
    const service = makeEnrolmentDunningService({
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 1),
    });

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );

    expect(result).toEqual({ outcome: 'skipped', reason: 'not_due' });
  });

  it('skips concurrent double cron', async () => {
    vi.setSystemTime(new Date(enrolmentDunningActionDueAt(CREATED_AT, 1)));
    const service = makeEnrolmentDunningService({
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 1),
    });
    service.setConcurrentBlocked(true);

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );

    expect(result).toEqual({ outcome: 'skipped', reason: 'concurrent_update' });
  });

  it('increments when email_opted_out (skip send only)', async () => {
    vi.setSystemTime(new Date(enrolmentDunningActionDueAt(CREATED_AT, 1)));
    const service = makeEnrolmentDunningService({
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 1),
    });

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      'https://app.test',
    );

    expect(result).toEqual({ outcome: 'reminded', attemptCount: 1 });
    expect(service.state.payment_dunning_attempt_count).toBe(1);
    expect(sendPaymentDunningReminder).toHaveBeenCalled();
  });

  it('skips send but increments when no APP_URL', async () => {
    vi.setSystemTime(new Date(enrolmentDunningActionDueAt(CREATED_AT, 1)));
    const service = makeEnrolmentDunningService({
      payment_dunning_next_at: enrolmentDunningActionDueAt(CREATED_AT, 1),
    });

    const result = await applyEnrolmentPaymentDunningStep(
      service as never,
      ENGAGEMENT_ID,
      '',
    );

    expect(result).toEqual({ outcome: 'reminded', attemptCount: 1 });
    expect(sendPaymentDunningReminder).not.toHaveBeenCalled();
  });
});
