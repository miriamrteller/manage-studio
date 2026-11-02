/**
 * Per-student and per-month amounts (payments follow-up 5): each month's amount is a one-off
 * amount for that month, else the student's own monthly amount, else the class price. Used by
 * monthly charges (provider-isolation-renewal-refund.test.ts), recorded monthly fees and the card
 * link. The database side (admin functions, audit, RLS) is supabase/tests/custom-amounts.
 * Fakes only.
 * Run: pnpm -C apps/web test custom-amounts.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { makeGrowFakeService } from './helpers/growFakeService';
import { pickMonthAmount, resolveMonthAmount } from '../../../../supabase/functions/_shared/payments/month-amount.ts';
import { recordManualRenewal } from '../../../../supabase/functions/_shared/payments/record-manual-renewal.ts';
import { createCardLinkCharge } from '../../../../supabase/functions/_shared/payments/card-link.ts';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const ENGAGEMENT = '11111111-1111-1111-1111-111111111111';
const BILLING = '22222222-2222-2222-2222-222222222222';
const OFFERING = '33333333-3333-3333-3333-333333333333';
const PERSON = '44444444-4444-4444-4444-444444444444';
const SCHEDULE = '55555555-5555-5555-5555-555555555555';

function studio(o: { studentAmount?: number | null; oneOff?: { period: string; amount_minor: number; note: string } } = {}) {
  return makeGrowFakeService({
    tables: {
      tenants: [{ id: TENANT, currency: 'ILS', payment_provider: 'grow' }],
      engagements: [{ id: ENGAGEMENT, tenant_id: TENANT, person_id: PERSON, offering_id: OFFERING, billing_account_id: BILLING, status: 'active' }],
      offerings: [{ id: OFFERING, price_minor: 35000, currency: 'ILS' }],
      people: [{ id: PERSON, account_id: null }],
      billing_schedules: [{
        id: SCHEDULE, tenant_id: TENANT, engagement_id: ENGAGEMENT, billing_account_id: BILLING,
        next_billing_date: '2026-12-01', status: 'active',
        amount_minor: o.studentAmount ?? null, amount_note: o.studentAmount ? 'Sibling' : null,
      }],
      billing_month_adjustments: o.oneOff
        ? [{ billing_schedule_id: SCHEDULE, kind: 'one_off', ...o.oneOff }]
        : [],
    },
  });
}

describe('pickMonthAmount', () => {
  it('one-off, else the student, else the class price', () => {
    expect(pickMonthAmount({ classPriceMinor: 35000, studentAmountMinor: null })).toEqual({ amountMinor: 35000, source: 'class', note: null });
    expect(pickMonthAmount({ classPriceMinor: 35000, studentAmountMinor: 30000, studentNote: 'Sibling' }))
      .toEqual({ amountMinor: 30000, source: 'student', note: 'Sibling' });
    expect(pickMonthAmount({ classPriceMinor: 35000, studentAmountMinor: 30000, oneOff: { amount_minor: 17500, note: 'Holiday' } }))
      .toEqual({ amountMinor: 17500, source: 'one_off', note: 'Holiday' });
  });

  it('reads the one-off for the right month only', async () => {
    const { service } = studio({ studentAmount: 30000, oneOff: { period: '2027-01', amount_minor: 17500, note: 'Holiday' } });
    expect((await resolveMonthAmount(service, { scheduleId: SCHEDULE, period: '2026-12', classPriceMinor: 35000 })).amountMinor).toBe(30000);
    expect((await resolveMonthAmount(service, { scheduleId: SCHEDULE, period: '2027-01', classPriceMinor: 35000 })).amountMinor).toBe(17500);
  });
});

describe('recording a monthly fee uses the month amount', () => {
  const input = {
    tenantId: TENANT,
    engagement: { id: ENGAGEMENT, person_id: PERSON, offering_id: OFFERING, billing_account_id: BILLING },
    method: 'cash' as const,
    actorUserId: 'admin-1',
  };
  const deps = { finalise: vi.fn(async () => undefined), priceMinor: (p: number) => p };

  it('defaults to a one-off amount for the month and keeps its reason on the payment', async () => {
    const { service, tables } = studio({ oneOff: { period: '2026-12', amount_minor: 10000, note: 'December: two lessons' } });
    expect(await recordManualRenewal(service, input, deps)).toMatchObject({ ok: true, period: '2026-12' });
    expect(tables.payments[0]).toMatchObject({ total_amount_minor: 10000 });
    expect(String(tables.payments[0].description)).toContain('December: two lessons');
    expect(tables.audit_log[0]).toMatchObject({
      after_state: expect.objectContaining({
        amount_minor: 10000,
        class_price_minor: 35000,
        month_amount_minor: 10000,
        month_amount_source: 'one_off',
        amount_changed: false,
      }),
    });
  });

  it("defaults to the student's own amount", async () => {
    const { service, tables } = studio({ studentAmount: 30000 });
    await recordManualRenewal(service, input, deps);
    expect(tables.payments[0]).toMatchObject({ total_amount_minor: 30000 });
  });
});

describe('the card link charges the month amount', () => {
  it("uses the student's amount for the month that is due", async () => {
    const createCharge = vi.fn(async () => ({ providerPaymentRef: 'x', pageUrl: 'https://grow.test/pay', pendingWebhook: true as const }));
    const result = await createCardLinkCharge(
      studio({ studentAmount: 30000 }).service,
      { tenantId: TENANT, engagementId: ENGAGEMENT },
      { createCharge, priceMinor: (p) => p },
    );
    expect(result).toMatchObject({ ok: true, amountMinor: 30000 });
    expect(createCharge).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 30000 }));
  });
});
