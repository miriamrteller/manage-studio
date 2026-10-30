/**
 * Photographer beta B: the YPay callback settles a job payment request exactly
 * once — replays, double successes, failures, unverified and mismatched
 * callbacks never produce a second charge or a second paid request.
 * Run: pnpm -C apps/web test job-ypay-callback-idempotency.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';

const finalise = vi.fn(async () => undefined);
vi.mock('../../../../supabase/functions/_shared/payments/finalise-payment.ts', () => ({
  finalisePayment: (...args: unknown[]) => finalise(...args),
}));
vi.mock('../../../../supabase/functions/_shared/payments/bundled-document-pdf.ts', () => ({
  fetchAndStoreBundledDocumentPdf: vi.fn(async () => ({ pdfPath: null })),
}));
vi.mock('../../../../supabase/functions/_shared/payments/send-payment-document-admin-email.ts', () => ({
  sendPaymentDocumentAdminEmail: vi.fn(async () => ({ sent: true })),
}));

import { processYpayPaymentCallback } from '../../../../supabase/functions/_shared/payments/ypay/process-callback.ts';
import { markJobPaymentRequestPaid } from '../../../../supabase/functions/_shared/jobs/mark-request-paid.ts';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const ENGAGEMENT = '00000000-0000-0000-0000-0000000000e1';
const BILLING = '00000000-0000-0000-0000-0000000000b1';
const REQUEST = 'req-1';
const CHARGE = 'charge-uuid-1';

function seed(overrides: Record<string, unknown> = {}) {
  return makeFakeSupabase({
    payments: [
      {
        id: 'pay-1',
        tenant_id: TENANT,
        engagement_id: ENGAGEMENT,
        billing_account_id: BILLING,
        charge_type: 'initial',
        status: 'pending',
        provider_payment_ref: CHARGE,
        total_amount_minor: 15000,
        pretax_amount_minor: 0,
        vat_amount_minor: 0,
        vat_rate: 0,
        currency: 'ILS',
        person_id: null,
        offering_id: null,
        job_payment_request_id: REQUEST,
        external_document_id: null,
        ...overrides,
      },
    ],
    job_payment_requests: [
      {
        id: REQUEST,
        tenant_id: TENANT,
        engagement_id: ENGAGEMENT,
        label: 'מקדמה',
        amount_minor: 15000,
        currency: 'ILS',
        due_date: '2026-11-10',
        status: 'sent',
        payment_id: null,
        sent_at: '2026-10-30T08:00:00Z',
        paid_at: null,
        max_installments: 1,
        public_token: 'a'.repeat(48),
        due_reminder_sent_at: null,
        overdue_reminder_sent_at: null,
      },
    ],
    audit_log: [],
    document_queue: [],
  });
}

const headers = new Headers({ 'x-mock-signature': 'mock-valid' });
const successBody = JSON.stringify({
  success: 'true',
  transactionId: 'TX-777',
  chargeIdentifier: CHARGE,
  sum: '150.00',
  document_id: 'DOC-1',
  document_type: '109',
  url: 'https://docs.ypay.test/DOC-1.pdf',
});

describe('processYpayPaymentCallback — job payment request', () => {
  beforeEach(() => finalise.mockClear());

  it('first success: upgrades the pending row, marks the request paid, records the bundled doc', async () => {
    const { db, client } = seed();
    const result = await processYpayPaymentCallback(client as never, successBody, headers, { mock: true });

    expect(result).toMatchObject({ status: 'succeeded', duplicate: false, paymentId: 'pay-1', jobPaymentRequest: REQUEST });
    const payment = db.tables.payments[0];
    expect(payment.status).toBe('succeeded');
    expect(payment.provider_payment_ref).toBe('TX-777');
    expect(payment.external_document_id).toBe('DOC-1');
    expect(payment.invoice_url).toBe('https://docs.ypay.test/DOC-1.pdf');

    const request = db.tables.job_payment_requests[0];
    expect(request.status).toBe('paid');
    expect(request.payment_id).toBe('pay-1');
    expect(request.paid_at).toBeTruthy();

    // No enrolment activation for a job charge.
    expect(finalise).not.toHaveBeenCalled();
    expect(db.tables.payments).toHaveLength(1);
    const actions = db.tables.audit_log.map((a) => a.action);
    expect(actions).toContain('job_payment_request.paid');
    expect(actions.filter((a) => a === 'job_payment_request.paid')).toHaveLength(1);
  });

  it('replaying the same callback is a no-op (by transactionId after the upgrade)', async () => {
    const { db, client } = seed();
    await processYpayPaymentCallback(client as never, successBody, headers, { mock: true });
    const updatesBefore = db.log.filter((l) => l.op === 'update').length;

    const replay = await processYpayPaymentCallback(client as never, successBody, headers, { mock: true });
    expect(replay).toMatchObject({ status: 'succeeded', duplicate: true, paymentId: 'pay-1' });
    expect(db.tables.payments).toHaveLength(1);
    expect(db.tables.job_payment_requests[0].payment_id).toBe('pay-1');
    expect(db.tables.audit_log.filter((a) => a.action === 'job_payment_request.paid')).toHaveLength(1);
    expect(db.tables.audit_log.filter((a) => a.action === 'payment_document_recorded')).toHaveLength(1);
    // Replay touches no money rows.
    const paymentUpdates = db.log.slice(updatesBefore).filter((l) => l.op === 'update' && l.table === 'payments');
    expect(paymentUpdates).toHaveLength(0);
  });

  it('a failed callback marks the charge failed and leaves the request collectable', async () => {
    const { db, client } = seed();
    const body = JSON.stringify({ success: 'false', transactionId: '0', chargeIdentifier: CHARGE });
    const result = await processYpayPaymentCallback(client as never, body, headers, { mock: true });
    expect(result).toMatchObject({ status: 'failed' });
    expect(db.tables.payments[0].status).toBe('failed');
    expect(db.tables.job_payment_requests[0].status).toBe('sent');
    expect(db.tables.audit_log.map((a) => a.action)).toContain('payment.failed');
  });

  it('an unverifiable live callback stays pending (fail closed)', async () => {
    const { db, client } = seed();
    const result = await processYpayPaymentCallback(client as never, successBody, headers, {
      mock: false,
      verify: async () => ({ verified: false, reason: 'no such transaction' }),
    });
    expect(result).toMatchObject({ status: 'unverified' });
    expect(db.tables.payments[0].status).toBe('pending');
    expect(db.tables.job_payment_requests[0].status).toBe('sent');
  });

  it('a verified live callback with the wrong amount does not settle', async () => {
    const { db, client } = seed();
    const body = JSON.stringify({ success: 'true', transactionId: 'TX-1', chargeIdentifier: CHARGE, sum: '99.00' });
    const result = await processYpayPaymentCallback(client as never, body, headers, {
      mock: false,
      verify: async () => ({ verified: true, amountMinor: 9900 }),
    });
    expect(result).toMatchObject({ status: 'amount_mismatch' });
    expect(db.tables.payments[0].status).toBe('pending');
    expect(db.tables.audit_log.map((a) => a.action)).toContain('payment.amount_mismatch');
  });

  it('a second successful charge for an already-paid request is flagged, not double-settled', async () => {
    const { db, client } = seed();
    await processYpayPaymentCallback(client as never, successBody, headers, { mock: true });

    // Client reopened the link: a second pending charge for the same request.
    db.tables.payments.push({
      ...db.tables.payments[0],
      id: 'pay-2',
      status: 'pending',
      provider_payment_ref: 'charge-uuid-2',
      external_document_id: null,
      invoice_url: null,
    });
    const second = JSON.stringify({ success: 'true', transactionId: 'TX-888', chargeIdentifier: 'charge-uuid-2', sum: '150.00' });
    const result = await processYpayPaymentCallback(client as never, second, headers, { mock: true });

    expect(result).toMatchObject({ status: 'succeeded', duplicate: false, paymentId: 'pay-2' });
    expect(db.tables.payments.find((p) => p.id === 'pay-2')?.status).toBe('succeeded');
    const request = db.tables.job_payment_requests[0];
    expect(request.status).toBe('paid');
    expect(request.payment_id).toBe('pay-1');
    const dup = db.tables.audit_log.filter((a) => a.action === 'job_payment_request.duplicate_payment');
    expect(dup).toHaveLength(1);
    expect(dup[0].after_state).toMatchObject({ payment_id: 'pay-2', settled_by_payment_id: 'pay-1' });
  });

  it('rejects a mock callback without the mock signature', async () => {
    const { client } = seed();
    await expect(
      processYpayPaymentCallback(client as never, successBody, new Headers(), { mock: true }),
    ).rejects.toThrow(/mock YPay signature/);
  });

  it('an enrolment charge (no request) still goes through finalisePayment', async () => {
    const { client } = seed({ job_payment_request_id: null });
    await processYpayPaymentCallback(client as never, successBody, headers, { mock: true });
    expect(finalise).toHaveBeenCalledTimes(1);
  });
});

describe('markJobPaymentRequestPaid', () => {
  it('is idempotent for the same payment and refuses cancelled requests', async () => {
    const { db, client } = seed();
    db.tables.job_payment_requests[0].status = 'cancelled';
    expect(await markJobPaymentRequestPaid(client as never, { requestId: REQUEST, paymentId: 'pay-1', method: 'cash' }))
      .toMatchObject({ outcome: 'not_collectable', status: 'cancelled' });

    db.tables.job_payment_requests[0].status = 'pending';
    expect(await markJobPaymentRequestPaid(client as never, { requestId: REQUEST, paymentId: 'pay-1', method: 'cash' }))
      .toMatchObject({ outcome: 'paid' });
    expect(await markJobPaymentRequestPaid(client as never, { requestId: REQUEST, paymentId: 'pay-1', method: 'cash' }))
      .toMatchObject({ outcome: 'already_paid_same_payment' });
    expect(await markJobPaymentRequestPaid(client as never, { requestId: 'nope', paymentId: 'pay-1', method: 'cash' }))
      .toMatchObject({ outcome: 'request_not_found' });
  });
});
