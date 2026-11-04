/**
 * Takbull PR 2: card payments through Takbull's page, and the payment notice (IPN).
 * The notice is never trusted: Takbull's own answers (ValidateNotification + GetTransaction)
 * and our amount decide. Fake database and fake Takbull only.
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

import { buildTakbullOrder, TakbullPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/takbull';
import { parseTakbullIpn, takbullPaymentMethod } from '../../../../supabase/functions/_shared/payments/takbull/ipn';
import { processTakbullIpn, takbullOutcome } from '../../../../supabase/functions/_shared/payments/takbull/process-ipn';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';
import { TakbullNotConnectedError } from '../../../../supabase/functions/_shared/payments/takbull/credentials';
import { documentKindFromTakbullType } from '../../../../supabase/functions/_shared/payments/document-kind';
import type { TakbullApi, TakbullTransaction } from '../../../../supabase/functions/_shared/payments/takbull/client';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const ENGAGEMENT = '00000000-0000-4000-8000-0000000000e1';
const BILLING = '00000000-0000-4000-8000-0000000000b1';
const PERSON = '00000000-0000-4000-8000-0000000000c1';
const PAYMENT = '00000000-0000-4000-8000-0000000000f1';
const UNIQ = 'uniq-1';
const TX = '000001003';

const metadata = {
  tenant_id: TENANT, engagement_id: ENGAGEMENT, billing_account_id: BILLING, charge_type: 'initial' as const,
  person_id: PERSON, total_amount_minor: '35000',
};

describe('the order', () => {
  it('is built from our payment: our id as order_reference, the notice URL, the document type, instalments', () => {
    const order = buildTakbullOrder({
      paymentId: PAYMENT, amountMinor: 35050, currency: 'ils', language: 'he', documentType: 400,
      payer: { name: 'Dana', email: 'd@x.test', phone: '050', identityNumber: null },
      lineName: 'Ballet', ipnUrl: 'https://fn/takbull-ipn', successUrl: 'https://app/ok', cancelUrl: 'https://app/no',
      installments: 3,
    });
    expect(order).toMatchObject({
      order_reference: PAYMENT, OrderTotalSum: 350.5, IPNAddress: 'https://fn/takbull-ipn', RedirectAddress: 'https://app/ok',
      CancelReturnAddress: 'https://app/no', Currency: 'ILS', CreateDocument: true, DocumentType: 400,
      DealType: 2, MaxNumberOfPayments: 3, Language: 'he',
      Customer: { CustomerFullName: 'Dana', Email: 'd@x.test', PhoneNumber: '050' },
      Products: [{ ProductName: 'Ballet', Price: 350.5, Quantity: 1 }],
    });
    const single = buildTakbullOrder({
      paymentId: PAYMENT, amountMinor: 100, currency: 'ILS', language: 'en', documentType: 320,
      payer: { name: 'Dana', email: null, phone: null, identityNumber: null },
      lineName: 'x', ipnUrl: 'i', successUrl: 's', cancelUrl: 'c',
    });
    expect(single.DealType).toBe(1);
    expect(single).not.toHaveProperty('MaxNumberOfPayments');
  });
});

describe('the notice and what Takbull says', () => {
  it('reads the notice from the query string (or a body)', () => {
    expect(parseTakbullIpn(`https://fn/takbull-ipn?uniqId=${UNIQ}&order_reference=${PAYMENT}&statusCode=0&statusDescription=Success&takbullAction=Charge&transactionInternalNumber=${TX}`))
      .toEqual({ uniqId: UNIQ, orderReference: PAYMENT, statusCode: 0, statusDescription: 'Success', action: 'Charge', transactionInternalNumber: TX });
    expect(parseTakbullIpn('https://fn/takbull-ipn', `uniqId=${UNIQ}&statusCode=5`)).toMatchObject({ uniqId: UNIQ, statusCode: 5 });
    expect(parseTakbullIpn('https://fn/takbull-ipn', JSON.stringify({ uniqId: UNIQ }))).toMatchObject({ uniqId: UNIQ });
    expect(takbullPaymentMethod(21)).toBe('bit');
    expect(takbullPaymentMethod(32)).toBe('card');
  });

  it('only Takbull confirming an approved charge for our amount settles it', () => {
    const ok = { internalCode: 0, orderStatus: 3 };
    const tx = (over: Partial<TakbullTransaction> = {}): TakbullTransaction => ({ amount: 350, statusCode: 0, status: 1, transactionType: 10, ...over });
    expect(takbullOutcome({ expectedMinor: 35000, validation: ok, transaction: tx() })).toBe('succeeded');
    expect(takbullOutcome({ expectedMinor: 35000, validation: { internalCode: 1400101 }, transaction: tx() })).toBe('unverified');
    expect(takbullOutcome({ expectedMinor: 35000, validation: ok, transaction: tx({ amount: 1 }) })).toBe('amount_mismatch');
    expect(takbullOutcome({ expectedMinor: 35000, validation: ok, transaction: tx({ status: 2, statusCode: 33 }) })).toBe('failed');
    expect(takbullOutcome({ expectedMinor: 35000, validation: { internalCode: 0, orderStatus: 9 }, transaction: null })).toBe('failed');
    expect(takbullOutcome({ expectedMinor: 35000, validation: ok, transaction: tx({ status: 4 }) })).toBe('pending');
    expect(takbullOutcome({ expectedMinor: 35000, validation: ok, transaction: null })).toBe('pending');
    // A refund transaction is never a payment.
    expect(takbullOutcome({ expectedMinor: 35000, validation: ok, transaction: tx({ transactionType: 20 }) })).toBe('unverified');
    expect(documentKindFromTakbullType(400)).toBe('receipt');
    expect(documentKindFromTakbullType(320)).toBe('tax_invoice_receipt');
    expect(documentKindFromTakbullType(401)).toBe('credit_note');
  });
});

function seedForCharge() {
  return makeFakeSupabase({
    tenants: [{ id: TENANT, language_default: 'he', takbull_document_type: 400 }],
    engagements: [{ id: ENGAGEMENT, person_id: PERSON, offering_id: 'off-1' }],
    people: [{ id: PERSON, account_id: null, name: 'Dana Levi', email: 'dana@x.test', emergency_contact_phone: '0501234567' }],
    billing_accounts: [{ id: BILLING, person_id: PERSON, account_id: null, business_tax_id: null }],
    payments: [], takbull_orders: [], audit_log: [],
  });
}

describe('createCharge', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('APP_URL', 'https://studio.test');
  });

  it('keeps a pending payment, opens a Takbull order for it, and returns the page', async () => {
    const { db, client } = seedForCharge();
    const api = new MockTakbullApi();
    const spy = vi.spyOn(api, 'getPaymentPageRedirectUrl');
    const provider = new TakbullPaymentProvider(client as never, async () => api);
    const result = await provider.createCharge({ amountMinor: 35000, currency: 'ILS', idempotencyKey: 'k', metadata, lineItem: { name: 'Ballet' } });

    const payment = db.tables.payments[0];
    expect(payment).toMatchObject({ provider: 'takbull', status: 'pending', total_amount_minor: 35000, person_id: PERSON });
    const order = spy.mock.calls[0][0];
    expect(order).toMatchObject({
      order_reference: payment.id, DocumentType: 400, IPNAddress: 'https://proj.supabase.co/functions/v1/takbull-ipn',
      RedirectAddress: 'https://studio.test/enrol/complete', Customer: { Email: 'dana@x.test', PhoneNumber: '0501234567' },
    });
    expect(result.pendingWebhook).toBe(true);
    // The payment and our order now carry Takbull's order id.
    expect(payment.provider_payment_ref).toBe(result.providerPaymentRef);
    expect(db.tables.takbull_orders[0]).toMatchObject({ payment_id: payment.id, uniq_id: result.providerPaymentRef, save_card: true });
    expect(result.pageUrl).toContain(`PaymentGateway?orderUniqId=${result.providerPaymentRef}`);
  });

  it('a refused order leaves no pending payment; no keys reads as "not configured"', async () => {
    const { db, client } = seedForCharge();
    const api = new MockTakbullApi();
    api.getPaymentPageRedirectUrl = () => Promise.reject(new Error('Bad sum'));
    await expect(new TakbullPaymentProvider(client as never, async () => api).createCharge({ amountMinor: 1, currency: 'ILS', idempotencyKey: 'k', metadata }))
      .rejects.toThrow('Bad sum');
    expect(db.tables.payments[0].status).toBe('failed');
    expect(new TakbullNotConnectedError().message).toMatch(/not configured/i);
  });
});

function seedForIpn(over: Record<string, unknown> = {}) {
  return makeFakeSupabase({
    tenants: [{ id: TENANT, takbull_document_type: 320 }],
    payments: [{
      id: PAYMENT, tenant_id: TENANT, provider: 'takbull', provider_payment_ref: UNIQ, status: 'pending',
      engagement_id: ENGAGEMENT, billing_account_id: BILLING, charge_type: 'initial', total_amount_minor: 35000,
      pretax_amount_minor: 0, vat_amount_minor: 0, vat_rate: 0, currency: 'ILS', person_id: PERSON, offering_id: null,
      job_payment_request_id: null, external_document_id: null, ...over,
    }],
    takbull_orders: [{ payment_id: PAYMENT, tenant_id: TENANT, uniq_id: UNIQ, metadata, save_card: true }],
    payment_method_tokens: [], audit_log: [], document_queue: [], job_payment_requests: [],
  });
}

function takbull(tx: Partial<TakbullTransaction> = {}, validation = { internalCode: 0, orderStatus: 3 }): TakbullApi {
  const api = new MockTakbullApi();
  api.validateNotification = vi.fn(async () => validation);
  api.getTransaction = vi.fn(async () => ({
    amount: 350, statusCode: 0, status: 1, transactionType: 10, paymentMethod: 3, cardToken: 'tok-1', last4DigitsCardNumber: '4242',
    cardTokenExpirationMonth: 4, cardTokenExpirationYear: 29, isDocumentCreated: true, invoiceUniqId: 'inv-1', documentNumber: 40101, ...tx,
  }));
  return api;
}

const notice = parseTakbullIpn(`https://fn/takbull-ipn?uniqId=${UNIQ}&order_reference=${PAYMENT}&statusCode=0&transactionInternalNumber=${TX}`);

describe('the notice settles a payment once, and only when Takbull confirms it', () => {
  it('confirmed: paid, settled without a second document, the receipt recorded, the card kept', async () => {
    const { db, client } = seedForIpn();
    const finalise = vi.fn(async () => undefined);
    const api = takbull();
    const result = await processTakbullIpn(client as never, notice, { apiFor: async () => api, finalise, now: () => new Date('2026-11-04T10:00:00Z') });
    expect(result).toEqual({ status: 'succeeded', paymentId: PAYMENT, duplicate: false });
    expect(api.validateNotification).toHaveBeenCalledWith(UNIQ);
    expect(db.tables.payments[0]).toMatchObject({ status: 'succeeded', provider_payment_ref: TX, payment_method: 'card', paid_at: '2026-11-04T10:00:00.000Z' });
    expect(finalise).toHaveBeenCalledWith(client, expect.objectContaining({ engagementId: ENGAGEMENT, chargeType: 'initial', skipDocumentEnqueue: true }));
    expect(db.tables.payments[0]).toMatchObject({ external_document_id: 'inv-1', external_document_number: '40101', issued_document_kind: 'tax_invoice_receipt' });
    expect(db.tables.payment_method_tokens).toEqual([
      expect.objectContaining({ provider: 'takbull', provider_token: 'tok-1', last4: '4242', exp_month: 4, exp_year: 2029, is_default: true, billing_account_id: BILLING }),
    ]);

    // The same notice again changes nothing.
    const again = await processTakbullIpn(client as never, notice, { apiFor: async () => api, finalise });
    expect(again).toEqual({ status: 'succeeded', paymentId: PAYMENT, duplicate: true });
    expect(finalise).toHaveBeenCalledTimes(1);
    expect(db.tables.payment_method_tokens).toHaveLength(1);
  });

  it('not confirmed by Takbull: stays pending and is audited (Takbull retries)', async () => {
    const { db, client } = seedForIpn();
    const result = await processTakbullIpn(client as never, notice, { apiFor: async () => takbull({}, { internalCode: 1400101 } as never) });
    expect(result.status).toBe('unverified');
    expect(db.tables.payments[0].status).toBe('pending');
    expect(db.tables.audit_log.some((a) => a.action === 'payment.unverified_callback')).toBe(true);
  });

  it('a different amount never settles', async () => {
    const { db, client } = seedForIpn();
    const result = await processTakbullIpn(client as never, notice, { apiFor: async () => takbull({ amount: 3.5 }) });
    expect(result.status).toBe('amount_mismatch');
    expect(db.tables.payments[0].status).toBe('pending');
  });

  it('a declined card marks the payment failed', async () => {
    const { db, client } = seedForIpn();
    const result = await processTakbullIpn(client as never, notice, { apiFor: async () => takbull({ status: 2, statusCode: 33 }) });
    expect(result.status).toBe('failed');
    expect(db.tables.payments[0].status).toBe('failed');
  });

  it('a notice naming another Takbull order is not ours to settle', async () => {
    const { db, client } = seedForIpn();
    const forged = parseTakbullIpn(`https://fn/takbull-ipn?uniqId=other&order_reference=${PAYMENT}&statusCode=0&transactionInternalNumber=${TX}`);
    const result = await processTakbullIpn(client as never, forged, { apiFor: async () => takbull() });
    expect(result.status).toBe('unverified');
    expect(db.tables.payments[0].status).toBe('pending');
  });

  it('a project payment request is marked paid (Bit), with no enrolment to finalise', async () => {
    const { db, client } = seedForIpn({ job_payment_request_id: 'req-1' });
    db.tables.job_payment_requests.push({ id: 'req-1', tenant_id: TENANT, engagement_id: ENGAGEMENT, label: 'מקדמה', amount_minor: 35000, currency: 'ILS', status: 'sent', payment_id: null, paid_at: null });
    const finalise = vi.fn(async () => undefined);
    const result = await processTakbullIpn(client as never, notice, { apiFor: async () => takbull({ paymentMethod: 21 }), finalise });
    expect(result.status).toBe('succeeded');
    expect(finalise).not.toHaveBeenCalled();
    expect(db.tables.job_payment_requests[0]).toMatchObject({ status: 'paid', payment_id: PAYMENT });
    expect(db.tables.payments[0].payment_method).toBe('bit');
  });

  it('an unknown order is reported as unknown', async () => {
    const { client } = makeFakeSupabase({ payments: [], takbull_orders: [] });
    await expect(processTakbullIpn(client as never, notice, { apiFor: async () => takbull() })).resolves.toEqual({ status: 'unknown_order' });
  });
});
