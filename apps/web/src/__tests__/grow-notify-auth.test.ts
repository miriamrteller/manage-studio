/**
 * Grow payment notices are authenticated and checked against our pending row (payments audit
 * P1 #1): webhook key required, tenant / engagement / amount must match what we charged,
 * approveTransaction must answer status 1, and replays are no-ops. Fake database, no network.
 * Run: pnpm -C apps/web test grow-notify-auth.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { finalisePayment, markJobPaymentRequestPaid, applyDunning } = vi.hoisted(() => ({
  finalisePayment: vi.fn(async () => undefined),
  markJobPaymentRequestPaid: vi.fn(async () => ({ outcome: 'paid' })),
  applyDunning: vi.fn(async () => undefined),
}));
vi.mock('../../../../supabase/functions/_shared/payments/finalise-payment.ts', () => ({ finalisePayment }));
vi.mock('../../../../supabase/functions/_shared/jobs/mark-request-paid.ts', () => ({
  markJobPaymentRequestPaid,
}));
vi.mock('../../../../supabase/functions/_shared/payments/apply-billing-schedule-dunning-failure.ts', () => ({
  applyBillingScheduleDunningFailure: applyDunning,
}));

import { processGrowNotify } from '../../../../supabase/functions/_shared/payments/grow/process-notify.ts';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import paymentNotify from './fixtures/grow-payment-notify.json';
import { makeGrowFakeService } from './helpers/growFakeService';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000bb';
const ENGAGEMENT = '11111111-1111-1111-1111-111111111111';
const BILLING = '22222222-2222-2222-2222-222222222222';
const REF = 'idem_11111111-1111-1111-1111-111111111111';
const KEY = 'a'.repeat(64);

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    tenant_id: TENANT,
    provider: 'grow',
    provider_payment_ref: REF,
    engagement_id: ENGAGEMENT,
    billing_account_id: BILLING,
    charge_type: 'initial',
    status: 'pending',
    total_amount_minor: 35000,
    currency: 'ILS',
    job_payment_request_id: null,
    ...overrides,
  };
}

function notice(data: Record<string, unknown> = {}, status: number = 1) {
  const base = (paymentNotify as { data: Record<string, unknown> }).data;
  return JSON.stringify({ status, data: { ...base, webhookKey: KEY, ...data } });
}

function setup(opts: { keys?: string[]; row?: Record<string, unknown> | null } = {}) {
  const fake = makeGrowFakeService({
    webhookKeys: opts.keys ?? [KEY],
    tables: {
      payments: opts.row === null ? [] : [pendingRow(opts.row ?? {})],
      tenants: [{ id: TENANT, payment_provider_account_id: 'grow_user_1' }],
    },
  });
  const deps = {
    approveTransaction: vi.fn(async () => undefined),
    persistCardToken: vi.fn(async () => undefined),
  };
  return { ...fake, deps };
}

beforeEach(() => {
  vi.stubEnv('GROW_API_BASE', 'https://grow.test/api/light/server/1.0');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  finalisePayment.mockClear();
  markJobPaymentRequestPaid.mockClear();
  applyDunning.mockClear();
});

describe('processGrowNotify — valid notice', () => {
  it('approves, marks the payment succeeded and settles the enrolment once', async () => {
    const { service, tables, deps } = setup();
    const result = await processGrowNotify(service, notice(), deps);

    expect(result).toEqual({ status: 'succeeded', paymentId: 'pay-1', duplicate: false });
    expect(deps.approveTransaction).toHaveBeenCalledTimes(1);
    expect(deps.persistCardToken).toHaveBeenCalledTimes(1);
    expect(tables.payments[0]).toMatchObject({ status: 'succeeded', paid_at: expect.any(String) });
    // Grow's own transaction id is kept for refunds (our reference stays in provider_payment_ref).
    expect(tables.payments[0]).toMatchObject({
      provider_payment_ref: REF,
      provider_transaction_id: '9988776',
      provider_transaction_token: 'tok_sandbox_redacted',
    });
    expect(finalisePayment).toHaveBeenCalledTimes(1);
    expect(finalisePayment).toHaveBeenCalledWith(service, expect.objectContaining({
      tenantId: TENANT,
      engagementId: ENGAGEMENT,
      chargeType: 'initial',
    }));
  });

  it('settles a photographer job request instead of an enrolment', async () => {
    const { service, deps } = setup({ row: { job_payment_request_id: 'jpr-1' } });
    const result = await processGrowNotify(service, notice(), deps);

    expect(result.status).toBe('succeeded');
    expect(markJobPaymentRequestPaid).toHaveBeenCalledWith(service, {
      requestId: 'jpr-1',
      paymentId: 'pay-1',
      method: 'card',
    });
    expect(finalisePayment).not.toHaveBeenCalled();
  });
});

describe('processGrowNotify — replayed notice', () => {
  it('is a no-op: no second approve or card token, settle stays idempotent', async () => {
    const { service, tables, deps } = setup();
    await processGrowNotify(service, notice(), deps);
    const replay = await processGrowNotify(service, notice(), deps);

    expect(replay).toEqual({ status: 'succeeded', paymentId: 'pay-1', duplicate: true });
    expect(deps.approveTransaction).toHaveBeenCalledTimes(1);
    expect(deps.persistCardToken).toHaveBeenCalledTimes(1);
    expect(tables.payments).toHaveLength(1);
  });

  it('a late decline never undoes a settled payment', async () => {
    const { service, tables, deps } = setup({ row: { status: 'succeeded' } });
    const result = await processGrowNotify(service, notice({}, 0), deps);

    expect(result).toEqual({ status: 'failed', paymentId: 'pay-1', duplicate: true });
    expect(tables.payments[0].status).toBe('succeeded');
  });

  it('a refunded payment is not settled again by a late success notice', async () => {
    const { service, tables, deps } = setup({ row: { status: 'refunded' } });
    const result = await processGrowNotify(service, notice(), deps);

    expect(result.status).toBe('unverified');
    expect(deps.approveTransaction).not.toHaveBeenCalled();
    expect(tables.payments[0].status).toBe('refunded');
  });
});

describe('processGrowNotify — forged notices are rejected', () => {
  const cases: [string, { keys?: string[] }, string][] = [
    ['no webhook key in the notice', {}, notice({ webhookKey: undefined })],
    ['a wrong webhook key', {}, notice({ webhookKey: 'b'.repeat(64) })],
    ['no key stored for the studio', { keys: [] }, notice()],
  ];

  it.each(cases)('rejects %s with 401 and changes nothing', async (_label, opts, body) => {
    const { service, tables, deps } = setup(opts);
    const result = await processGrowNotify(service, body, deps);

    expect(result).toMatchObject({ status: 'rejected', httpStatus: 401 });
    expect(deps.approveTransaction).not.toHaveBeenCalled();
    expect(tables.payments[0].status).toBe('pending');
    expect(finalisePayment).not.toHaveBeenCalled();
    expect(tables.audit_log.some((a) => a.action === 'payment.webhook_rejected')).toBe(true);
  });

  it('rejects a notice with no tenant (400)', async () => {
    const { service, deps } = setup();
    const result = await processGrowNotify(service, notice({ cField1: undefined }), deps);
    expect(result).toMatchObject({ status: 'rejected', httpStatus: 400 });
  });

  it('rejects a body that is not JSON (400)', async () => {
    const { service, deps } = setup();
    const result = await processGrowNotify(service, 'status=1&sum=1', deps);
    expect(result).toMatchObject({ status: 'rejected', httpStatus: 400 });
  });
});

describe('processGrowNotify — notice must match our pending row', () => {
  it('rejects a wrong amount and leaves the payment pending', async () => {
    const { service, tables, deps } = setup();
    const result = await processGrowNotify(service, notice({ sum: '1.00' }), deps);

    expect(result).toMatchObject({ status: 'amount_mismatch', paymentId: 'pay-1' });
    expect(deps.approveTransaction).not.toHaveBeenCalled();
    expect(tables.payments[0].status).toBe('pending');
    expect(tables.audit_log.some((a) => a.action === 'payment.amount_mismatch')).toBe(true);
  });

  it('rejects a notice without a sum (never trusts our own custom fields)', async () => {
    const { service, deps } = setup();
    const result = await processGrowNotify(service, notice({ sum: undefined }), deps);
    expect(result.status).toBe('amount_mismatch');
    expect(deps.approveTransaction).not.toHaveBeenCalled();
  });

  it('rejects a payment reference we never created', async () => {
    const { service, deps } = setup({ row: null });
    const result = await processGrowNotify(service, notice(), deps);
    expect(result.status).toBe('unverified');
    expect(deps.approveTransaction).not.toHaveBeenCalled();
  });

  it("rejects another studio's valid key used against this studio's payment", async () => {
    // Same key value for both tenants in the fake, so only the tenant check can stop it.
    const { service, tables, deps } = setup();
    const result = await processGrowNotify(service, notice({ cField1: OTHER_TENANT }), deps);
    expect(result.status).toBe('unverified');
    expect(tables.payments[0].status).toBe('pending');
  });

  it('rejects a different engagement', async () => {
    const { service, deps } = setup();
    const result = await processGrowNotify(
      service,
      notice({ cField2: '99999999-9999-9999-9999-999999999999' }),
      deps,
    );
    expect(result.status).toBe('unverified');
    expect(deps.approveTransaction).not.toHaveBeenCalled();
  });

  it('rejects a payment that belongs to another provider', async () => {
    const { service, deps } = setup({ row: { provider: 'ypay' } });
    const result = await processGrowNotify(service, notice(), deps);
    expect(result.status).toBe('unverified');
  });
});

describe('processGrowNotify — declined notice', () => {
  it('marks the pending payment failed and audits it', async () => {
    const { service, tables, deps } = setup();
    const result = await processGrowNotify(service, notice({}, 0), deps);

    expect(result).toEqual({ status: 'failed', paymentId: 'pay-1', duplicate: false });
    expect(tables.payments[0].status).toBe('failed');
    expect(deps.approveTransaction).not.toHaveBeenCalled();
  });
});

describe('approveTransaction must return status 1', () => {
  it('settles when Grow answers status 1, sending the transaction id and token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ status: 1 }), { status: 200 }));
    const { service, tables } = setup();
    const result = await processGrowNotify(service, notice(), new GrowPaymentProvider(service));

    expect(result.status).toBe('succeeded');
    expect(tables.payments[0].status).toBe('succeeded');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://grow.test/api/light/server/1.0/approveTransaction');
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({ transactionId: '9988776', transactionToken: 'tok_sandbox_redacted' });
  });

  it.each([
    ['status 0 with HTTP 200', new Response(JSON.stringify({ status: 0, err: { message: 'nope' } }), { status: 200 })],
    ['no status', new Response('{}', { status: 200 })],
    ['HTTP 500', new Response(JSON.stringify({ status: 1 }), { status: 500 })],
  ])('leaves the payment pending on %s', async (_label, response) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const { service, tables } = setup();
    const result = await processGrowNotify(service, notice(), new GrowPaymentProvider(service));

    expect(result.status).toBe('unverified');
    expect(tables.payments[0].status).toBe('pending');
    expect(finalisePayment).not.toHaveBeenCalled();
  });
});

describe('GrowPaymentProvider', () => {
  it('constructEvent refuses, so the unchecked generic path stays closed', async () => {
    const { service } = setup();
    await expect(
      new GrowPaymentProvider(service).constructEvent(notice(), new Headers(), TENANT),
    ).rejects.toThrow(/processGrowNotify/);
  });

  it('refuses to call Grow when GROW_API_BASE is not set (no silent sandbox)', async () => {
    vi.stubEnv('GROW_API_BASE', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { service } = setup();
    const result = await new GrowPaymentProvider(service).verifyCredentials(TENANT);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/GROW_API_BASE/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('insertPendingGrowPayment (checkout retries reuse the row)', () => {
  const metadata = {
    tenant_id: TENANT,
    engagement_id: ENGAGEMENT,
    billing_account_id: BILLING,
    charge_type: 'initial' as const,
  };
  const engagements = [{ id: ENGAGEMENT, tenant_id: TENANT, person_id: 'p-1', offering_id: 'o-1' }];

  async function insert(row: Record<string, unknown> | null, amountMinor = 35000) {
    const { insertPendingGrowPayment } = await import(
      '../../../../supabase/functions/_shared/payments/grow/pending-charge.ts'
    );
    const fake = makeGrowFakeService({
      tables: { payments: row ? [pendingRow(row)] : [], engagements },
    });
    const promise = insertPendingGrowPayment(fake.service, {
      transactionUniqueIdentifier: REF,
      amountMinor,
      currency: 'ils',
      metadata,
    });
    return { promise, tables: fake.tables };
  }

  it('inserts a new pending row', async () => {
    const { promise, tables } = await insert(null);
    await promise;
    expect(tables.payments).toHaveLength(1);
    expect(tables.payments[0]).toMatchObject({ status: 'pending', provider: 'grow', currency: 'ILS' });
  });

  it('reuses a pending row and reopens a failed one', async () => {
    const pending = await insert({});
    await expect(pending.promise).resolves.toEqual({ paymentId: 'pay-1' });
    expect(pending.tables.payments).toHaveLength(1);

    const failed = await insert({ status: 'failed' });
    await expect(failed.promise).resolves.toEqual({ paymentId: 'pay-1' });
    expect(failed.tables.payments[0].status).toBe('pending');
  });

  it('refuses to charge again once paid, or for a different amount', async () => {
    await expect((await insert({ status: 'succeeded' })).promise).rejects.toThrow(/already succeeded/);
    await expect((await insert({}, 100)).promise).rejects.toThrow(/different charge/);
  });

  it("refuses an engagement from another studio", async () => {
    const { insertPendingGrowPayment } = await import(
      '../../../../supabase/functions/_shared/payments/grow/pending-charge.ts'
    );
    const fake = makeGrowFakeService({
      tables: { engagements: [{ ...engagements[0], tenant_id: OTHER_TENANT }] },
    });
    await expect(
      insertPendingGrowPayment(fake.service, {
        transactionUniqueIdentifier: REF,
        amountMinor: 35000,
        currency: 'ILS',
        metadata,
      }),
    ).rejects.toThrow(/Engagement not found/);
  });
});
