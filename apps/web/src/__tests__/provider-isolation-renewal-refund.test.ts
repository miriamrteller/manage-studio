/**
 * I4 provider isolation — renewals and refunds dispatch by payment/tenant provider slug.
 * Run: pnpm -C apps/web test provider-isolation-renewal-refund.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processBillingSchedule } from '../../../../supabase/functions/_shared/payments/renewal-billing.ts';
import {
  loadRenewalSavedToken,
  providerUsesSavedTokenRenewal,
} from '../../../../supabase/functions/_shared/payments/renewal-billing.ts';
import { executeProviderRefund } from '../../../../supabase/functions/_shared/payments/refund-provider.ts';
import * as mockApi from '../../../../supabase/functions/_shared/payments/icount/mock-api.ts';
import { parseIcountIpn } from '../../../../supabase/functions/_shared/payments/icount/ipn.ts';
import { encodeIcountIpnBody } from '../../../../supabase/functions/_shared/payments/icount/ipn.ts';
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { MockIcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-icount.ts';
import { MockInvoice4uPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-invoice4u.ts';
import * as mockSync from '../../../../supabase/functions/_shared/payments/providers/mock.ts';

vi.mock('../../../../supabase/functions/_shared/collections/send-payment-dunning-reminder.ts', () => ({
  sendPaymentDunningReminder: vi.fn().mockResolvedValue({ sent: false }),
}));

const GROW_TENANT = '00000000-0000-0000-0000-0000000000aa';
const ICOUNT_TENANT = '00000000-0000-0000-0000-0000000000bb';
const INVOICE4U_TENANT = '00000000-0000-0000-0000-0000000000cc';
const ENGAGEMENT_ID = '11111111-1111-1111-1111-111111111111';
const BILLING_ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';
const SCHEDULE_ID = '55555555-5555-5555-5555-555555555555';
const OFFERING_ID = '33333333-3333-3333-3333-333333333333';
const PERSON_ID = '44444444-4444-4444-4444-444444444444';

function makeBillingService(options: {
  paymentProvider: 'grow' | 'icount' | 'invoice4u';
  tenantId: string;
  savedToken?: string | null;
}) {
  const token = options.savedToken === undefined ? 'saved_tok_abc' : options.savedToken;

  const service = {
    from(table: string) {
      if (table === 'engagements') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: ENGAGEMENT_ID,
                  offering_id: OFFERING_ID,
                  person_id: PERSON_ID,
                  billing_account_id: BILLING_ACCOUNT_ID,
                  provider_customer_ref: null,
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      if (table === 'offerings') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  price_minor: 35000,
                  currency: 'ILS',
                  billing_mode: 'recurring',
                },
                error: null,
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
                  currency: 'ILS',
                  payment_provider: options.paymentProvider,
                  name: 'Studio',
                  language_default: 'en',
                  from_email: 'studio@test.com',
                  primary_color: '#000',
                  accent_color: '#fff',
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'payment_method_tokens') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                eq: () => ({
                  maybeSingle: async () =>
                    token
                      ? { data: { provider_token: token }, error: null }
                      : { data: null, error: null },
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'billing_schedules') {
        const scheduleRow = {
          id: SCHEDULE_ID,
          tenant_id: options.tenantId,
          engagement_id: ENGAGEMENT_ID,
          attempt_count: 0,
          status: 'active',
          next_attempt_at: null as string | null,
        };

        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: scheduleRow,
                error: null,
              }),
            }),
          }),
          update: (updates: Record<string, unknown>) => ({
            eq: () => {
              const chain: Record<string, unknown> = {
                eq: () => chain,
                neq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      Object.assign(scheduleRow, updates);
                      return {
                        data: {
                          attempt_count: scheduleRow.attempt_count,
                          next_attempt_at: scheduleRow.next_attempt_at,
                          status: scheduleRow.status,
                        },
                        error: null,
                      };
                    },
                  }),
                }),
                then: (resolve: (v: unknown) => void) => resolve({ error: null }),
              };
              return chain;
            },
          }),
        };
      }

      if (table === 'notification_log' || table === 'contact_preferences') {
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
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          insert: async () => ({ error: null }),
        };
      }

      if (table === 'people') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: { name: 'Student', email: 'test@example.com' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  } as never;

  return service;
}

describe('renewal token helpers', () => {
  it('providerUsesSavedTokenRenewal includes grow, icount, and invoice4u', () => {
    expect(providerUsesSavedTokenRenewal('grow')).toBe(true);
    expect(providerUsesSavedTokenRenewal('icount')).toBe(true);
    expect(providerUsesSavedTokenRenewal('invoice4u')).toBe(true);
    expect(providerUsesSavedTokenRenewal('stripe')).toBe(false);
    expect(providerUsesSavedTokenRenewal('mock')).toBe(false);
  });
});

describe('run-monthly-billing provider isolation (I4-T1, I4-T2)', () => {
  const originalDeno = globalThis.Deno;

  beforeEach(() => {
    globalThis.Deno = {
      env: {
        get: (k: string) => {
          if (k === 'APP_URL') return 'https://app.test';
          return process.env[k];
        },
      },
    } as typeof globalThis.Deno;
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    process.env.INVOICE4U_MOCK = 'true';
    vi.spyOn(mockSync, 'applyMockSyncEvent').mockResolvedValue(undefined);
  });

  afterEach(() => {
    globalThis.Deno = originalDeno;
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
    delete process.env.INVOICE4U_MOCK;
    vi.restoreAllMocks();
  });

  it('I4-T1: grow tenant renewal uses MockGrow only — no Grow HTTP, no iCount adapter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const growSpy = vi.spyOn(MockGrowPaymentProvider.prototype, 'createCharge');
    const icountSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'createCharge');

    const service = makeBillingService({
      paymentProvider: 'grow',
      tenantId: GROW_TENANT,
    });

    const result = await processBillingSchedule(
      service,
      {
        id: SCHEDULE_ID,
        tenant_id: GROW_TENANT,
        engagement_id: ENGAGEMENT_ID,
        billing_account_id: BILLING_ACCOUNT_ID,
        attempt_count: 0,
      },
      '2026-06',
    );

    expect(result.outcome).toBe('charged');
    expect(growSpy).toHaveBeenCalledOnce();
    expect(icountSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSync.applyMockSyncEvent).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ type: 'payment.succeeded' }),
      'grow',
    );
  });

  it('I4-T2: icount tenant renewal uses chargeWithToken + mock IPN — no Grow HTTP', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const growSpy = vi.spyOn(MockGrowPaymentProvider.prototype, 'createCharge');
    const icountCreateSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'createCharge');
    const icountChargeSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'chargeWithToken');
    const deliverSpy = vi.spyOn(mockApi, 'deliverMockIcountIpn').mockResolvedValue(undefined);

    const service = makeBillingService({
      paymentProvider: 'icount',
      tenantId: ICOUNT_TENANT,
    });

    const result = await processBillingSchedule(
      service,
      {
        id: SCHEDULE_ID,
        tenant_id: ICOUNT_TENANT,
        engagement_id: ENGAGEMENT_ID,
        billing_account_id: BILLING_ACCOUNT_ID,
        attempt_count: 0,
      },
      '2026-06',
    );

    expect(result.outcome).toBe('charged');
    expect(icountChargeSpy).toHaveBeenCalledOnce();
    expect(icountCreateSpy).not.toHaveBeenCalled();
    expect(growSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(deliverSpy).toHaveBeenCalledOnce();
    expect(mockSync.applyMockSyncEvent).not.toHaveBeenCalled();
  });

  it('loads saved token for icount renewals (regression fix)', async () => {
    const service = makeBillingService({
      paymentProvider: 'icount',
      tenantId: ICOUNT_TENANT,
      savedToken: 'icount_saved_tok',
    });

    const token = await loadRenewalSavedToken(service, BILLING_ACCOUNT_ID);
    expect(token).toBe('icount_saved_tok');
  });

  it('fails icount renewal when no saved token is present', async () => {
    const service = makeBillingService({
      paymentProvider: 'icount',
      tenantId: ICOUNT_TENANT,
      savedToken: null,
    });

    const result = await processBillingSchedule(
      service,
      {
        id: SCHEDULE_ID,
        tenant_id: ICOUNT_TENANT,
        engagement_id: ENGAGEMENT_ID,
        billing_account_id: BILLING_ACCOUNT_ID,
        attempt_count: 0,
      },
      '2026-06',
    );

    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.error).toMatch(/icount/i);
    }
  });

  it('U4-mock: invoice4u renewal uses chargeWithToken + sync event — not Grow/iCount', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const growSpy = vi.spyOn(MockGrowPaymentProvider.prototype, 'createCharge');
    const icountSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'chargeWithToken');
    const invoice4uChargeSpy = vi.spyOn(MockInvoice4uPaymentProvider.prototype, 'chargeWithToken');
    const invoice4uCreateSpy = vi.spyOn(MockInvoice4uPaymentProvider.prototype, 'createCharge');

    const service = makeBillingService({
      paymentProvider: 'invoice4u',
      tenantId: INVOICE4U_TENANT,
      savedToken: 'i4u_customer_1001',
    });

    const result = await processBillingSchedule(
      service,
      {
        id: SCHEDULE_ID,
        tenant_id: INVOICE4U_TENANT,
        engagement_id: ENGAGEMENT_ID,
        billing_account_id: BILLING_ACCOUNT_ID,
        attempt_count: 0,
      },
      '2026-06',
    );

    expect(result.outcome).toBe('charged');
    expect(invoice4uChargeSpy).toHaveBeenCalledOnce();
    expect(invoice4uChargeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ savedToken: 'i4u_customer_1001' }),
    );
    expect(invoice4uCreateSpy).not.toHaveBeenCalled();
    expect(growSpy).not.toHaveBeenCalled();
    expect(icountSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSync.applyMockSyncEvent).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ type: 'payment.succeeded' }),
      'invoice4u',
    );
  });
});

describe('process-refund provider isolation (I4-T3, I4-T4, U4-mock)', () => {
  const service = {} as never;

  beforeEach(() => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    process.env.INVOICE4U_MOCK = 'true';
  });

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
    delete process.env.INVOICE4U_MOCK;
    vi.restoreAllMocks();
  });

  it('I4-T3: refund on grow payment row uses Grow refundCharge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const growSpy = vi.spyOn(MockGrowPaymentProvider.prototype, 'refundCharge');
    const icountSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'refundCharge');

    await executeProviderRefund(
      service,
      { provider: 'grow', provider_payment_ref: 'mockgrow_txn_777' },
      35000,
    );

    expect(growSpy).toHaveBeenCalledOnce();
    expect(icountSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('I4-T4: refund on icount payment row uses MockIcount refundCharge — no Grow HTTP', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const growSpy = vi.spyOn(MockGrowPaymentProvider.prototype, 'refundCharge');
    const icountSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'refundCharge');

    const result = await executeProviderRefund(
      service,
      { provider: 'icount', provider_payment_ref: 'mockicount_txn_1' },
      35000,
    );

    expect(icountSpy).toHaveBeenCalledOnce();
    expect(growSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('U4-mock: refund on invoice4u payment row uses PaymentId via MockInvoice4u refundCharge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const growSpy = vi.spyOn(MockGrowPaymentProvider.prototype, 'refundCharge');
    const icountSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'refundCharge');
    const invoice4uSpy = vi.spyOn(MockInvoice4uPaymentProvider.prototype, 'refundCharge');

    await executeProviderRefund(
      service,
      { provider: 'invoice4u', provider_payment_ref: '22222222-2222-2222-2222-222222222201' },
      35000,
    );

    expect(invoice4uSpy).toHaveBeenCalledOnce();
    expect(invoice4uSpy).toHaveBeenCalledWith({
      providerPaymentRef: '22222222-2222-2222-2222-222222222201',
      amountMinor: 35000,
    });
    expect(growSpy).not.toHaveBeenCalled();
    expect(icountSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('credential RPC token invalidation (I4-T5)', () => {
  const migrationsDir = resolve(__dirname, '../../../../supabase/migrations');
  const tokenMigration = readFileSync(
    resolve(migrationsDir, '20260629000100_provider_token_invalidation.sql'),
    'utf8',
  );

  it('save_tenant_icount_credentials revokes non-icount tokens for the tenant', () => {
    const icountBlock =
      tokenMigration.match(
        /CREATE OR REPLACE FUNCTION save_tenant_icount_credentials[\s\S]*?END;\s*\$\$;/,
      )?.[0] ?? '';
    expect(icountBlock).toContain('UPDATE payment_method_tokens SET');
    expect(icountBlock).toContain("provider <> 'icount'");
    expect(icountBlock).toContain('revoked_at = now()');
  });

  it('save_tenant_grow_credentials revokes non-grow tokens for the tenant', () => {
    const growBlock =
      tokenMigration.match(
        /CREATE OR REPLACE FUNCTION save_tenant_grow_credentials[\s\S]*?END;\s*\$\$;/,
      )?.[0] ?? '';
    expect(growBlock).toContain('UPDATE payment_method_tokens SET');
    expect(growBlock).toContain("provider <> 'grow'");
    expect(growBlock).toContain('revoked_at = now()');
  });

  it('save_tenant_invoice4u_credentials revokes non-invoice4u tokens', () => {
    const invoice4uMigration = readFileSync(
      resolve(migrationsDir, '20260720000100_invoice4u_credentials.sql'),
      'utf8',
    );
    expect(invoice4uMigration).toContain("AND provider <> 'invoice4u'");
    expect(invoice4uMigration).toContain('UPDATE payment_method_tokens SET');
    expect(invoice4uMigration).toContain('revoked_at = now()');
  });
});

describe('Grow regression (I4 mock DoD)', () => {
  it('grow-renewal-charge and grow-refund test files remain importable', async () => {
    await expect(import('./grow-renewal-charge.test.ts')).resolves.toBeDefined();
    await expect(import('./grow-refund.test.ts')).resolves.toBeDefined();
  });
});

describe('iCount mock parity isolation (I4-T6, I4-T7, I4-T8)', () => {
  const renewalMetadata = {
    tenant_id: ICOUNT_TENANT,
    engagement_id: ENGAGEMENT_ID,
    billing_account_id: BILLING_ACCOUNT_ID,
    charge_type: 'renewal' as const,
    billing_schedule_id: SCHEDULE_ID,
    offering_id: OFFERING_ID,
    person_id: PERSON_ID,
    vat_rate: '0',
    pretax_amount_minor: '0',
    vat_amount_minor: '0',
    total_amount_minor: '35000',
  };

  it('I4-T6: icount renewal never calls createCharge', async () => {
    const createSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'createCharge');
    const chargeSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'chargeWithToken');
    vi.spyOn(mockApi, 'deliverMockIcountIpn').mockResolvedValue(undefined);

    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';

    await processBillingSchedule(
      makeBillingService({ paymentProvider: 'icount', tenantId: ICOUNT_TENANT }),
      {
        id: SCHEDULE_ID,
        tenant_id: ICOUNT_TENANT,
        engagement_id: ENGAGEMENT_ID,
        billing_account_id: BILLING_ACCOUNT_ID,
        attempt_count: 0,
      },
      '2026-06',
    );

    expect(chargeSpy).toHaveBeenCalledOnce();
    expect(createSpy).not.toHaveBeenCalled();

    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
    vi.restoreAllMocks();
  });

  it('I4-T7: icount enrolment createCharge never calls chargeWithToken', async () => {
    const provider = new MockIcountPaymentProvider();
    const createSpy = vi.spyOn(provider, 'createCharge');
    const chargeSpy = vi.spyOn(provider, 'chargeWithToken');

    await provider.createCharge({
      amountMinor: 35000,
      currency: 'ILS',
      idempotencyKey: 'enrol-1',
      metadata: { ...renewalMetadata, charge_type: 'initial', billing_schedule_id: undefined },
    });

    expect(createSpy).toHaveBeenCalledOnce();
    expect(chargeSpy).not.toHaveBeenCalled();
  });

  it('I4-T8: MockIcount constructEvent rejects JSON PaymentEvent blobs', async () => {
    const provider = new MockIcountPaymentProvider();
    const jsonBody = JSON.stringify({
      type: 'payment.succeeded',
      providerPaymentRef: 'mockicount_bad',
      metadata: renewalMetadata,
      amountMinor: 35000,
      currency: 'ILS',
    });
    const headers = new Headers({ 'x-mock-signature': 'mock-valid' });

    await expect(provider.constructEvent(jsonBody, headers, ICOUNT_TENANT)).rejects.toThrow(
      /rejected JSON PaymentEvent/i,
    );
  });

  it('parseIcountIpn rejects Grow notify bodies', () => {
    const growBody = encodeIcountIpnBody({
      transactionId: '12345',
      sum: 350,
      currency_code: 'ILS',
    });
    expect(() => parseIcountIpn(growBody)).toThrow(/Grow notify/i);
  });
});
