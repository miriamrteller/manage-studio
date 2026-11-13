/**
 * OpalSwift's own billing, step B3: the monthly charge on a studio's saved card (ChargeToken on
 * OpalSwift's account), retries on days 3 and 7, never two charges for one month, founders and
 * the charging switch respected. Fake database and the mock Takbull only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import {
  addDays,
  buildPlatformTokenCharge,
  declineEmail,
  israelToday,
  nextAttemptOn,
  runPlatformBilling,
  skipReason,
} from '../../../../supabase/functions/_shared/payments/takbull/platform-billing-charge';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';
import { TakbullApiError } from '../../../../supabase/functions/_shared/payments/takbull/client';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const NOW = new Date('2026-12-01T05:00:00Z');

beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://db.example.test' : undefined) } });
});

function seed(opts: { sub?: Record<string, unknown>; payments?: unknown[]; charging?: boolean } = {}) {
  const fake = makeFakeSupabase({
    platform_billing_settings: [{ id: true, charging_enabled: opts.charging ?? true }],
    tenants: [{
      id: TENANT, name: 'Lens Studio', contact_email: 'studio@example.test', language_default: 'he',
      legal_profile: { legal_name: 'Lens Studio Ltd', business_number: '515555555' },
    }],
    studio_subscriptions: [{
      tenant_id: TENANT, monthly_amount_agorot: null, founder: false, free_until: null,
      next_charge_on: '2026-12-01', failed_attempts: 0, card_token_enc: 'enc', ...opts.sub,
    }],
    platform_payments: (opts.payments ?? []) as Array<Record<string, unknown>>,
  } as Record<string, Array<Record<string, unknown>>>);
  const rpc = vi.fn(async (name: string) => ({ data: name === 'get_studio_card_token' ? 'tok-1' : null, error: null }));
  (fake.client as unknown as { rpc: typeof rpc }).rpc = rpc;
  return { ...fake, rpc, sub: fake.db.tables.studio_subscriptions[0] };
}

describe('when a studio is due', () => {
  it('tries on the due date, then 3 and 7 days later, then stops', () => {
    expect(nextAttemptOn({ next_charge_on: '2026-12-01', failed_attempts: 0 })).toBe('2026-12-01');
    expect(nextAttemptOn({ next_charge_on: '2026-12-01', failed_attempts: 1 })).toBe('2026-12-04');
    expect(nextAttemptOn({ next_charge_on: '2026-12-01', failed_attempts: 2 })).toBe('2026-12-08');
    expect(nextAttemptOn({ next_charge_on: '2026-12-01', failed_attempts: 3 })).toBeNull();
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('uses the Israeli date', () => {
    expect(israelToday(new Date('2026-11-30T23:30:00Z'))).toBe('2026-12-01');
  });

  it('skips founders before 2027, free studios, and studios not due yet', () => {
    const base = { tenant_id: TENANT, monthly_amount_agorot: null, founder: false, free_until: null, next_charge_on: '2026-12-01', failed_attempts: 0 };
    expect(skipReason(base, '2026-12-01')).toBeNull();
    expect(skipReason({ ...base, founder: true }, '2026-12-01')).toBe('founder');
    expect(skipReason({ ...base, founder: true, next_charge_on: '2027-01-01' }, '2027-01-01')).toBeNull();
    expect(skipReason({ ...base, free_until: '2027-02-01' }, '2026-12-01')).toBe('free');
    expect(skipReason({ ...base, failed_attempts: 1 }, '2026-12-03')).toBe('not_due');
    expect(skipReason({ ...base, failed_attempts: 3 }, '2026-12-20')).toBe('out_of_retries');
    // "Charge now" skips the date and the retries, never the founder rule.
    expect(skipReason({ ...base, next_charge_on: '2027-03-01' }, '2026-12-01', true)).toBeNull();
    expect(skipReason({ ...base, founder: true }, '2026-12-01', true)).toBe('founder');
  });
});

describe('the charge', () => {
  it('is a ChargeToken on the saved card, named pb_<id>, with OpalSwift\'s receipt', () => {
    const r = buildPlatformTokenCharge({
      paymentId: 'p1', amountAgorot: 100, language: 'he', documentType: 400, ipnUrl: 'https://ipn', token: 'tok',
      payer: { name: 'Lens Studio Ltd', email: null, businessNumber: '515555555' },
    });
    expect(r).toMatchObject({
      order_reference: 'pb_p1', OrderTotalSum: 1, DealType: 1, CreateDocument: true, DocumentType: 400,
      CreditCard: { CardExternalToken: 'tok' }, Customer: { IdentityNumber: '515555555' },
    });
    expect(r).not.toHaveProperty('RedirectAddress');
  });

  it('charges a due studio once and moves the next charge on a month', async () => {
    const { db, client, sub } = seed();
    const api = new MockTakbullApi();
    const r = await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(r).toMatchObject({ ok: true, studios: [{ tenantId: TENANT, result: 'succeeded', period: '2026-12-01' }] });
    expect(api.tokenCharges).toHaveLength(1);
    expect(api.tokenCharges[0]).toMatchObject({ OrderTotalSum: 1, CreditCard: { CardExternalToken: 'tok-1' } });
    expect(db.tables.platform_payments[0]).toMatchObject({ period_month: '2026-12-01', attempt: 1, status: 'succeeded' });
    expect(sub.next_charge_on).toBe('2027-01-01');

    // A rerun the same day: not due any more, nothing charged.
    const again = await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(again).toEqual({ ok: true, studios: [] });
    expect(api.tokenCharges).toHaveLength(1);
  });

  it('never charges a month already paid, and moves the date on instead', async () => {
    const { client, sub } = seed({
      payments: [{ id: 'paid', tenant_id: TENANT, period_month: '2026-12-01', attempt: 1, amount_agorot: 100, status: 'succeeded' }],
    });
    const api = new MockTakbullApi();
    const r = await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(r).toMatchObject({ ok: true, studios: [{ result: 'skipped', reason: 'already_paid' }] });
    expect(api.tokenCharges).toHaveLength(0);
    expect(sub.next_charge_on).toBe('2027-01-01');
  });

  it('does not charge while an earlier charge for the month had no answer', async () => {
    const { client } = seed({
      payments: [{ id: 'p', tenant_id: TENANT, period_month: '2026-12-01', attempt: 1, amount_agorot: 100, status: 'pending', error_code: 'no_answer', created_at: '2026-11-30T05:00:00Z' }],
    });
    const api = new MockTakbullApi();
    const r = await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(r).toMatchObject({ ok: true, studios: [{ result: 'skipped', reason: 'pending' }] });
    expect(api.tokenCharges).toHaveLength(0);
  });

  it('is not blocked by an "Add a card" page left unpaid days ago', async () => {
    const { client } = seed({
      payments: [{ id: 'p', tenant_id: TENANT, period_month: '2026-12-01', attempt: 1, amount_agorot: 100, status: 'pending', error_code: null, created_at: '2026-11-28T05:00:00Z' }],
    });
    const api = new MockTakbullApi();
    const r = await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(r).toMatchObject({ ok: true, studios: [{ result: 'succeeded' }] });
  });

  it('marks a decline, counts it, emails the studio and tries again on day 3', async () => {
    const { db, client, sub } = seed();
    const api = new MockTakbullApi();
    api.chargeToken = () => Promise.reject(new TakbullApiError('Card declined', { endpoint: 'ChargeToken', code: 4, retryable: true }));
    const notifyDeclined = vi.fn(async () => {});
    const r = await runPlatformBilling(client as never, {}, { api, now: () => NOW, notifyDeclined });
    expect(r).toMatchObject({ ok: true, studios: [{ result: 'declined', nextTryOn: '2026-12-04' }] });
    expect(db.tables.platform_payments[0]).toMatchObject({ status: 'failed', error_code: '4' });
    expect(sub.failed_attempts).toBe(1);
    expect(sub.next_charge_on).toBe('2026-12-01');
    expect(notifyDeclined).toHaveBeenCalledWith({ tenantId: TENANT, amountAgorot: 100, nextTryOn: '2026-12-04' });

    // Day 2: not due. Day 4: the second attempt.
    const day2 = await runPlatformBilling(client as never, {}, { api, now: () => new Date('2026-12-02T05:00:00Z'), notifyDeclined });
    expect(day2).toMatchObject({ ok: true, studios: [{ result: 'skipped', reason: 'not_due' }] });
    api.chargeToken = () => Promise.resolve({ internalCode: 0, orderId: 77 } as never);
    const day4 = await runPlatformBilling(client as never, {}, { api, now: () => new Date('2026-12-04T05:00:00Z') });
    expect(day4).toMatchObject({ ok: true, studios: [{ result: 'succeeded' }] });
    expect(db.tables.platform_payments[1]).toMatchObject({ attempt: 2, status: 'succeeded', takbull_order_ref: '77' });
    expect(sub).toMatchObject({ failed_attempts: 0, next_charge_on: '2027-01-01' });
  });

  it('treats a failed order status as a decline', async () => {
    const { client, sub } = seed();
    const api = new MockTakbullApi();
    api.chargeToken = () => Promise.resolve({ internalCode: 0, orderStatus: 1 });
    const r = await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(r).toMatchObject({ ok: true, studios: [{ result: 'declined' }] });
    expect(sub.failed_attempts).toBe(1);
  });

  it('keeps a charge with no answer pending, so it is never repeated', async () => {
    const { db, client, sub } = seed();
    const api = new MockTakbullApi();
    api.chargeToken = () => Promise.reject(new TakbullApiError('timed out', { endpoint: 'ChargeToken', retryable: true }));
    const r = await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(r).toMatchObject({ ok: true, studios: [{ result: 'unclear' }] });
    expect(db.tables.platform_payments[0]).toMatchObject({ status: 'pending', error_code: 'no_answer' });
    expect(sub.failed_attempts).toBe(0);
  });

  it('charges nothing while charging is switched off', async () => {
    const { client } = seed({ charging: false });
    const api = new MockTakbullApi();
    expect(await runPlatformBilling(client as never, {}, { api, now: () => NOW })).toEqual({ ok: false, code: 'charging_off' });
    expect(api.tokenCharges).toHaveLength(0);
  });

  it('"Charge now" charges one studio\'s next month early', async () => {
    const { client, sub } = seed({ sub: { next_charge_on: '2027-01-01' } });
    const api = new MockTakbullApi();
    const r = await runPlatformBilling(client as never, { tenantId: TENANT, force: true }, { api, now: () => NOW });
    expect(r).toMatchObject({ ok: true, studios: [{ result: 'succeeded', period: '2027-01-01' }] });
    expect(sub.next_charge_on).toBe('2027-02-01');
  });

  it('charges the studio\'s monthly price when one is set', async () => {
    const { client } = seed({ sub: { monthly_amount_agorot: 9900 } });
    const api = new MockTakbullApi();
    await runPlatformBilling(client as never, {}, { api, now: () => NOW });
    expect(api.tokenCharges[0].OrderTotalSum).toBe(99);
  });
});

describe('the decline email', () => {
  it('says when we try again, in Hebrew and English', () => {
    const he = declineEmail({ language: 'he', studioName: 'Lens', amountAgorot: 100, nextTryOn: '2026-12-04', settingsUrl: 'https://x/admin/settings/payments' });
    expect(he.html).toContain('04/12/2026');
    expect(he.html).toContain('dir="rtl"');
    const en = declineEmail({ language: 'en', studioName: 'A <b>', amountAgorot: 9900, nextTryOn: null, settingsUrl: 'https://x' });
    expect(en.subject).toContain("couldn't charge");
    expect(en.html).toContain('₪99');
    expect(en.html).toContain('A &lt;b&gt;');
    expect(en.html).toContain("won't try again");
  });
});
