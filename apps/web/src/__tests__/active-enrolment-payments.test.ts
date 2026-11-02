/**
 * Payments B (owner decision): an admin records a monthly fee paid at the studio for any month
 * of an ACTIVE enrolment (a renewal linked to its monthly plan), and a monthly plan that has
 * always been paid at the studio is never charged online or dunned until a card is saved.
 * Fakes only; no provider or database calls.
 * Run: pnpm -C apps/web test active-enrolment-payments.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { makeGrowFakeService } from './helpers/growFakeService';
import {
  manualRenewalRef,
  recordManualRenewal,
} from '../../../../supabase/functions/_shared/payments/record-manual-renewal.ts';
import { advanceBillingSchedule } from '../../../../supabase/functions/_shared/payments/advance-billing-schedule.ts';
import {
  collectedAtStudio,
  nextMonthCheckAt,
  processBillingSchedule,
} from '../../../../supabase/functions/_shared/payments/renewal-billing.ts';

const TENANT = 'tenant-1';
const ENGAGEMENT = { id: 'eng-1', person_id: 'person-1', offering_id: 'off-1', billing_account_id: 'ba-1' };

function studio(overrides: { schedule?: Record<string, unknown> | null; payments?: Record<string, unknown>[]; tokens?: Record<string, unknown>[]; paymentProvider?: string } = {}) {
  return makeGrowFakeService({
    tables: {
      billing_schedules: overrides.schedule === null ? [] : [{
        id: 'sched-1',
        tenant_id: TENANT,
        engagement_id: ENGAGEMENT.id,
        billing_account_id: 'ba-1',
        next_billing_date: '2026-12-01',
        next_attempt_at: null,
        attempt_count: 0,
        last_error: null,
        status: 'active',
        ...overrides.schedule,
      }],
      engagements: [{ ...ENGAGEMENT, tenant_id: TENANT, status: 'active', provider_customer_ref: null }],
      offerings: [{ id: 'off-1', price_minor: 35000, currency: 'ILS', billing_mode: 'recurring' }],
      tenants: [{ id: TENANT, currency: 'ILS', payment_provider: overrides.paymentProvider ?? 'offline' }],
      people: [{ id: 'person-1', account_id: 'acct-1' }],
      payments: overrides.payments ?? [
        { id: 'pay-0', engagement_id: ENGAGEMENT.id, charge_type: 'initial', status: 'succeeded', provider: 'manual', created_at: '2026-11-01' },
      ],
      payment_method_tokens: overrides.tokens ?? [],
    },
  });
}

/** Finalise as far as the schedule goes: the real advance, with the recorded month. */
const deps = {
  finalise: vi.fn(async (service: never, params: { billingScheduleId?: string; paidForPeriod?: string }) => {
    await advanceBillingSchedule(service, params.billingScheduleId!, new Date('2026-11-15T10:00:00Z'), {
      paidForPeriod: params.paidForPeriod,
    });
  }),
  priceMinor: (price: number) => price,
};

const input = { tenantId: TENANT, engagement: ENGAGEMENT, method: 'cash' as const, actorUserId: 'admin-1' };

describe('recording a monthly fee paid at the studio', () => {
  it('records the month that is due as a renewal on the monthly plan, audited, and moves the plan on', async () => {
    const { service, tables } = studio();
    const result = await recordManualRenewal(service, input, deps);

    expect(result).toEqual({ ok: true, paymentId: expect.any(String), period: '2026-12' });
    const payment = tables.payments.find((p) => p.provider_payment_ref === manualRenewalRef('sched-1', '2026-12'));
    expect(payment).toMatchObject({
      charge_type: 'renewal',
      provider: 'manual',
      payment_method: 'cash',
      status: 'succeeded',
      total_amount_minor: 35000,
      billing_account_id: 'ba-1',
      created_by: 'admin-1',
    });
    expect(tables.audit_log).toContainEqual(expect.objectContaining({
      action: 'manual_renewal_recorded',
      actor_id: 'admin-1',
      after_state: expect.objectContaining({ period: '2026-12', billing_schedule_id: 'sched-1', method: 'cash' }),
    }));
    expect(deps.finalise).toHaveBeenLastCalledWith(service, expect.objectContaining({
      chargeType: 'renewal',
      billingScheduleId: 'sched-1',
      paidForPeriod: '2026-12',
      actorUserId: 'admin-1',
    }));
    expect(tables.billing_schedules[0].next_billing_date).toBe('2027-01-01');
  });

  it('recording again pays the next month (paying ahead), and a month is never recorded twice', async () => {
    const { service, tables } = studio();
    await recordManualRenewal(service, input, deps);
    const second = await recordManualRenewal(service, { ...input, method: 'bank_transfer' }, deps);
    expect(second).toMatchObject({ ok: true, period: '2027-01' });
    expect(tables.billing_schedules[0].next_billing_date).toBe('2027-02-01');

    // Even if the plan were back on December, December cannot be recorded again.
    tables.billing_schedules[0].next_billing_date = '2026-12-01';
    const again = await recordManualRenewal(service, input, deps);
    expect(again).toMatchObject({ ok: false, status: 409, code: 'month_already_recorded' });
  });

  it('refuses an enrolment with no open monthly plan', async () => {
    const none = studio({ schedule: null });
    expect(await recordManualRenewal(none.service, input, deps)).toMatchObject({ ok: false, status: 409, code: 'no_monthly_plan' });
    const cancelled = studio({ schedule: { status: 'cancelled' } });
    expect(await recordManualRenewal(cancelled.service, input, deps)).toMatchObject({ ok: false, code: 'no_monthly_plan' });
    const otherStudio = studio({ schedule: { tenant_id: 'tenant-2' } });
    expect(await recordManualRenewal(otherStudio.service, input, deps)).toMatchObject({ ok: false, code: 'no_monthly_plan' });
  });

  it('a recorded month only moves the plan while that month is still the one due', async () => {
    const { service, tables } = studio();
    await advanceBillingSchedule(service, 'sched-1', new Date(), { paidForPeriod: '2026-11' });
    expect(tables.billing_schedules[0].next_billing_date).toBe('2026-12-01');
  });
});

describe('a monthly plan paid at the studio is not charged online until a card is saved', () => {
  it('collectedAtStudio: first payment recorded by hand and no card with the current provider', async () => {
    const params = { engagementId: ENGAGEMENT.id, billingAccountId: 'ba-1', paymentProvider: 'grow' };
    expect(await collectedAtStudio(studio().service, params)).toBe(true);
    // A card saved with another provider does not count.
    const otherCard = studio({ tokens: [{ id: 't1', billing_account_id: 'ba-1', provider: 'invoice4u', revoked_at: null }] });
    expect(await collectedAtStudio(otherCard.service, params)).toBe(true);
    // Once the parent saves a Grow card, renewals charge it.
    const growCard = studio({ tokens: [{ id: 't2', billing_account_id: 'ba-1', provider: 'grow', revoked_at: null }] });
    expect(await collectedAtStudio(growCard.service, params)).toBe(false);
    // An enrolment first paid online is charged (and dunned) as before.
    const paidOnline = studio({ payments: [{ id: 'p', engagement_id: ENGAGEMENT.id, charge_type: 'initial', status: 'succeeded', provider: 'grow', created_at: '2026-11-01' }] });
    expect(await collectedAtStudio(paidOnline.service, params)).toBe(false);
  });

  it('after a move to Grow, the plan is skipped quietly: no charge, no dunning, checked again next month', async () => {
    const { service, tables } = studio({ paymentProvider: 'grow' });
    const result = await processBillingSchedule(
      service,
      { id: 'sched-1', tenant_id: TENANT, engagement_id: ENGAGEMENT.id, billing_account_id: 'ba-1', attempt_count: 0 },
      '2026-12',
    );
    expect(result).toEqual({ outcome: 'skipped' });
    expect(tables.billing_schedules[0]).toMatchObject({
      attempt_count: 0,
      last_error: null,
      status: 'active',
      next_attempt_at: '2027-01-01T06:00:00.000Z',
    });
    expect(tables.payments.filter((p) => p.charge_type === 'renewal')).toHaveLength(0);
  });

  it('a pay-at-the-studio studio is also checked again next month, not every run', async () => {
    const { service, tables } = studio({ paymentProvider: 'offline' });
    const result = await processBillingSchedule(
      service,
      { id: 'sched-1', tenant_id: TENANT, engagement_id: ENGAGEMENT.id, billing_account_id: 'ba-1', attempt_count: 0 },
      '2026-12',
    );
    expect(result).toEqual({ outcome: 'skipped' });
    expect(tables.billing_schedules[0].next_attempt_at).toBe('2027-01-01T06:00:00.000Z');
    expect(tables.billing_schedules[0].attempt_count).toBe(0);
  });

  it('nextMonthCheckAt rolls over the year', () => {
    expect(nextMonthCheckAt('2026-12')).toBe('2027-01-01T06:00:00.000Z');
    expect(nextMonthCheckAt('2026-06')).toBe('2026-07-01T06:00:00.000Z');
  });
});
