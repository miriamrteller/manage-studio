/**
 * Takbull PR 3: monthly fees charged to the saved card (ChargeToken). The result comes back
 * through the same notice handler as a page payment, checked with Takbull before it settles;
 * a decline goes to dunning. The same attempt is never charged twice. Fakes only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';

vi.mock('../../../../supabase/functions/_shared/payments/bundled-document-pdf.ts', () => ({
  fetchAndStoreBundledDocumentPdf: vi.fn(async () => ({ pdfPath: null })),
}));
vi.mock('../../../../supabase/functions/_shared/payments/send-payment-document-admin-email.ts', () => ({
  sendPaymentDocumentAdminEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../../../../supabase/functions/_shared/payments/finalise-payment.ts', () => ({
  finalisePayment: vi.fn(async () => undefined),
}));
const dunning = vi.hoisted(() => vi.fn(async () => ({ attemptCount: 1, nextAttemptAt: null, suspended: false })));
vi.mock('../../../../supabase/functions/_shared/payments/apply-billing-schedule-dunning-failure.ts', () => ({
  applyBillingScheduleDunningFailure: dunning,
}));
const providerForTenant = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../../../supabase/functions/_shared/payments/index.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getPaymentProviderForTenant: vi.fn(async () => providerForTenant.current) };
});

import {
  buildTakbullTokenCharge,
  takbullChargePeriod,
  takbullRenewalKey,
  TakbullPaymentProvider,
} from '../../../../supabase/functions/_shared/payments/providers/takbull';
import { processTakbullIpn, takbullOrderIsOurs } from '../../../../supabase/functions/_shared/payments/takbull/process-ipn';
import { TakbullDuplicateChargeError } from '../../../../supabase/functions/_shared/payments/takbull/pending-charge';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';
import { finalisePayment } from '../../../../supabase/functions/_shared/payments/finalise-payment';
import { processBillingSchedule, providerUsesSavedTokenRenewal } from '../../../../supabase/functions/_shared/payments/renewal-billing';
import { CARD_LINK_PROVIDERS, cardLinkRef } from '../../../../supabase/functions/_shared/payments/card-link';
import { CARD_LINK_PAYMENT_PROVIDERS, monthlyFeesSupported } from '../lib/providerPairing';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const ENGAGEMENT = '00000000-0000-4000-8000-0000000000e1';
const BILLING = '00000000-0000-4000-8000-0000000000b1';
const PERSON = '00000000-0000-4000-8000-0000000000c1';
const SCHEDULE = '00000000-0000-4000-8000-0000000000d1';
const OFFERING = '00000000-0000-4000-8000-0000000000f9';

const renewalMetadata = {
  tenant_id: TENANT, engagement_id: ENGAGEMENT, billing_account_id: BILLING, charge_type: 'renewal' as const,
  billing_schedule_id: SCHEDULE, person_id: PERSON, total_amount_minor: '30000',
};
const RENEWAL_KEY = `renewal-${ENGAGEMENT}-2026-12`;

function seed() {
  return makeFakeSupabase({
    tenants: [{ id: TENANT, language_default: 'he', takbull_document_type: 320 }],
    engagements: [{ id: ENGAGEMENT, person_id: PERSON, offering_id: OFFERING }],
    people: [{ id: PERSON, account_id: null, name: 'Parent', email: 'parent@x.test', emergency_contact_phone: null }],
    billing_accounts: [{ id: BILLING, person_id: PERSON, account_id: null, business_tax_id: null }],
    payments: [], takbull_orders: [], audit_log: [], payment_method_tokens: [], document_queue: [],
  });
}

function charge(provider: TakbullPaymentProvider, key = takbullRenewalKey(RENEWAL_KEY, 0), token = 'tok-saved') {
  return provider.chargeWithToken({ amountMinor: 30000, currency: 'ILS', idempotencyKey: key, metadata: renewalMetadata, savedToken: token });
}

/**
 * The fake database names rows "payments-1"; a real payment id is a uuid, which is what the
 * notice handler looks for in order_reference. Give the charged payment one everywhere.
 */
function withUuid(db: { tables: Record<string, Array<Record<string, unknown>>> }, api: MockTakbullApi): string {
  const id = crypto.randomUUID();
  const payment = db.tables.payments[db.tables.payments.length - 1];
  const order = db.tables.takbull_orders.find((o) => o.payment_id === payment.id)!;
  const takbullOrder = api.orders.get(api.lastTokenOrder!.uniqId)!;
  payment.id = id;
  order.payment_id = id;
  takbullOrder.order_reference = id;
  return id;
}

/** The notice Takbull sends for the order the last saved-card charge made. */
function noticeFor(api: MockTakbullApi, paymentId: string) {
  const order = api.lastTokenOrder!;
  return { uniqId: order.uniqId, orderReference: paymentId, statusCode: 0, statusDescription: 'OK', action: 'Charge', transactionInternalNumber: order.transactionInternalNumber };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('APP_URL', 'https://studio.test');
  vi.mocked(finalisePayment).mockClear();
  dunning.mockClear();
});

describe('keys and the request', () => {
  it('one key per renewal attempt; the month comes from the key', () => {
    expect(takbullRenewalKey(RENEWAL_KEY, 2)).toBe(`${RENEWAL_KEY}-a2`);
    expect(takbullChargePeriod(`${RENEWAL_KEY}-a2`)).toBe('2026-12');
    expect(takbullChargePeriod(cardLinkRef(SCHEDULE, '2027-01'))).toBe('2027-01');
    expect(takbullChargePeriod('k')).toBeNull();
  });

  it('ChargeToken carries our payment id, the notice URL, the document and the card; no page settings', () => {
    const request = buildTakbullTokenCharge({
      paymentId: 'pay-1', amountMinor: 30000, currency: 'ILS', language: 'he', documentType: 400,
      payer: { name: 'Parent', email: null, phone: null, identityNumber: null },
      lineName: 'Monthly fee', ipnUrl: 'https://fn/takbull-ipn', successUrl: 's', cancelUrl: 'c', cardToken: 'tok-1',
    });
    expect(request).toMatchObject({
      order_reference: 'pay-1', OrderTotalSum: 300, IPNAddress: 'https://fn/takbull-ipn', CreateDocument: true,
      DocumentType: 400, CreditCard: { CardExternalToken: 'tok-1' },
    });
    for (const key of ['DisplayType', 'PostProcessMethod', 'DealType', 'MaxNumberOfPayments']) expect(request).not.toHaveProperty(key);
  });
});

describe('a month charged to the saved card', () => {
  it('stays pending until the notice is confirmed, then pays exactly that month', async () => {
    const { db, client } = seed();
    const api = new MockTakbullApi();
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    const result = await charge(provider);

    expect(result.pendingWebhook).toBe(true);
    const payment = db.tables.payments[0];
    expect(payment).toMatchObject({ provider: 'takbull', status: 'pending', charge_type: 'renewal', total_amount_minor: 30000 });
    expect(db.tables.takbull_orders[0]).toMatchObject({ payment_id: payment.id, charge_key: `${RENEWAL_KEY}-a0`, paid_for_period: '2026-12', save_card: false });
    expect(db.tables.takbull_orders[0].uniq_id ?? null).toBeNull();
    expect(api.tokenCharges[0]).toMatchObject({ order_reference: payment.id, CreditCard: { CardExternalToken: 'tok-saved' } });

    const id = withUuid(db, api);
    const settled = await processTakbullIpn(client as never, noticeFor(api, id), { apiFor: async () => api });
    expect(settled).toEqual({ status: 'succeeded', paymentId: payment.id, duplicate: false });
    expect(payment.status).toBe('succeeded');
    expect(finalisePayment).toHaveBeenCalledWith(client, expect.objectContaining({
      chargeType: 'renewal', billingScheduleId: SCHEDULE, paidForPeriod: '2026-12', skipDocumentEnqueue: true,
    }));
    // Takbull's order is pinned to the payment from now on.
    expect(db.tables.takbull_orders[0].uniq_id).toBe(api.lastTokenOrder!.uniqId);
    // No new card: the saved one is still the one.
    expect(db.tables.payment_method_tokens).toHaveLength(0);
  });

  it('the same attempt is never sent twice, even while its notice is still on its way', async () => {
    const { client } = seed();
    const api = new MockTakbullApi();
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    await charge(provider);
    await expect(charge(provider)).rejects.toBeInstanceOf(TakbullDuplicateChargeError);
    expect(api.tokenCharges).toHaveLength(1);
  });

  it('a decline throws (the run applies dunning), and the next attempt can charge again', async () => {
    const { db, client } = seed();
    const api = new MockTakbullApi();
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    await expect(charge(provider, takbullRenewalKey(RENEWAL_KEY, 0), 'declined-tok')).rejects.toThrow('Card declined');
    expect(db.tables.payments[0].status).toBe('failed');
    expect(db.tables.takbull_orders[0].charge_key).toBeNull();
    await charge(provider, takbullRenewalKey(RENEWAL_KEY, 1));
    expect(api.tokenCharges).toHaveLength(2);
  });

  it('a declined notice fails the payment and counts one dunning attempt, once', async () => {
    const { db, client } = seed();
    const api = new MockTakbullApi();
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    await charge(provider);
    const paymentId = withUuid(db, api);
    const tx = api.lastTokenOrder!.transactionInternalNumber;
    api.transactions.set(tx, { ...api.transactions.get(tx)!, status: 2, statusCode: 33 });

    const notice = noticeFor(api, paymentId);
    await expect(processTakbullIpn(client as never, notice, { apiFor: async () => api }))
      .resolves.toEqual({ status: 'failed', paymentId, duplicate: false });
    expect(db.tables.payments[0].status).toBe('failed');
    expect(dunning).toHaveBeenCalledWith(client, expect.objectContaining({ billingScheduleId: SCHEDULE }));
    await processTakbullIpn(client as never, notice, { apiFor: async () => api });
    expect(dunning).toHaveBeenCalledTimes(1);
  });

  it("a notice naming a Takbull order that isn't this payment's never settles it", async () => {
    const { db, client } = seed();
    const api = new MockTakbullApi();
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    await charge(provider);
    const paymentId = withUuid(db, api);
    const notice = noticeFor(api, paymentId);
    api.getOrder = vi.fn(async () => ({ order_reference: 'someone-else', transactions: [] }));

    const result = await processTakbullIpn(client as never, notice, { apiFor: async () => api });
    expect(result.status).toBe('unverified');
    expect(db.tables.payments[0].status).toBe('pending');
    expect(db.tables.takbull_orders[0].uniq_id ?? null).toBeNull();

    expect(takbullOrderIsOurs({ paymentId: 'p', order: { order_reference: 'p', transactions: [{ transactionId: '7' }] }, transaction: { amount: 1, statusCode: 0, transactionId: '8' }, transactionInternalNumber: '8' })).toBe(false);
    expect(takbullOrderIsOurs({ paymentId: 'p', order: { order_reference: 'p', transactions: [{ transactionId: '8' }] }, transaction: { amount: 1, statusCode: 0 }, transactionInternalNumber: '8' })).toBe(true);
  });
});

describe('card link', () => {
  it("sending again reuses the page that's still waiting; the payment pays that month", async () => {
    const { db, client } = seed();
    const api = new MockTakbullApi();
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    const params = {
      amountMinor: 30000, currency: 'ILS', idempotencyKey: cardLinkRef(SCHEDULE, '2026-12'),
      metadata: { ...renewalMetadata, save_card: '1' as const }, saveCard: true,
    };
    const first = await provider.createCharge(params);
    const second = await provider.createCharge(params);
    expect(second.pageUrl).toBe(first.pageUrl);
    expect(db.tables.payments).toHaveLength(1);
    expect(db.tables.takbull_orders[0]).toMatchObject({ save_card: true, paid_for_period: '2026-12', charge_key: params.idempotencyKey });
  });
});

describe('the monthly run', () => {
  function billingSeed() {
    return makeFakeSupabase({
      engagements: [{ id: ENGAGEMENT, offering_id: OFFERING, person_id: PERSON, billing_account_id: BILLING, provider_customer_ref: null }],
      offerings: [{ id: OFFERING, price_minor: 30000, currency: 'ILS', billing_mode: 'recurring' }],
      tenants: [{ id: TENANT, currency: 'ILS', payment_provider: 'takbull' }],
      payment_method_tokens: [{ id: 't1', billing_account_id: BILLING, provider: 'takbull', provider_token: 'tok-saved', is_default: true, revoked_at: null }],
      payments: [], billing_schedule_month_amounts: [], billing_schedules: [{ id: SCHEDULE, student_amount_minor: null }],
    });
  }
  const schedule = { id: SCHEDULE, tenant_id: TENANT, engagement_id: ENGAGEMENT, billing_account_id: BILLING, attempt_count: 1 };

  it('charges Takbull studios with the saved card, one key per attempt', async () => {
    const chargeWithToken = vi.fn(async () => ({ providerPaymentRef: 'r', pendingWebhook: true as const }));
    providerForTenant.current = { slug: 'takbull', chargeWithToken, createCharge: vi.fn() };
    const { client } = billingSeed();
    await expect(processBillingSchedule(client as never, schedule, '2026-12')).resolves.toEqual({ outcome: 'charged' });
    expect(chargeWithToken).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: `${RENEWAL_KEY}-a1`, savedToken: 'tok-saved', amountMinor: 30000,
    }));
  });

  it('an attempt already waiting for its notice is skipped, with no dunning', async () => {
    providerForTenant.current = { slug: 'takbull', chargeWithToken: vi.fn(async () => { throw new TakbullDuplicateChargeError(); }), createCharge: vi.fn() };
    const { client } = billingSeed();
    await expect(processBillingSchedule(client as never, schedule, '2026-12')).resolves.toEqual({ outcome: 'skipped' });
    expect(dunning).not.toHaveBeenCalled();
  });

  it('Takbull is on the saved-card, card-link and monthly-fee lists (web and server agree)', () => {
    expect(providerUsesSavedTokenRenewal('takbull')).toBe(true);
    expect([...CARD_LINK_PROVIDERS]).toContain('takbull');
    expect([...CARD_LINK_PAYMENT_PROVIDERS]).toEqual([...CARD_LINK_PROVIDERS]);
    expect(monthlyFeesSupported('takbull')).toBe(true);
  });
});
