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
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { MockIcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-icount.ts';
import * as mockSync from '../../../../supabase/functions/_shared/payments/providers/mock.ts';

const GROW_TENANT = '00000000-0000-0000-0000-0000000000aa';
const ICOUNT_TENANT = '00000000-0000-0000-0000-0000000000bb';
const ENGAGEMENT_ID = '11111111-1111-1111-1111-111111111111';
const BILLING_ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';
const SCHEDULE_ID = '55555555-5555-5555-5555-555555555555';
const OFFERING_ID = '33333333-3333-3333-3333-333333333333';
const PERSON_ID = '44444444-4444-4444-4444-444444444444';

function makeBillingService(options: {
  paymentProvider: 'grow' | 'icount';
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
        return {
          update: () => ({ eq: async () => ({ error: null }) }),
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
  it('providerUsesSavedTokenRenewal includes grow and icount only', () => {
    expect(providerUsesSavedTokenRenewal('grow')).toBe(true);
    expect(providerUsesSavedTokenRenewal('icount')).toBe(true);
    expect(providerUsesSavedTokenRenewal('stripe')).toBe(false);
    expect(providerUsesSavedTokenRenewal('mock')).toBe(false);
  });
});

describe('run-monthly-billing provider isolation (I4-T1, I4-T2)', () => {
  beforeEach(() => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    vi.spyOn(mockSync, 'applyMockSyncEvent').mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
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

  it('I4-T2: icount tenant renewal uses MockIcount only — no Grow HTTP', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const growSpy = vi.spyOn(MockGrowPaymentProvider.prototype, 'createCharge');
    const icountSpy = vi.spyOn(MockIcountPaymentProvider.prototype, 'createCharge');

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
    expect(icountSpy).toHaveBeenCalledOnce();
    expect(growSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSync.applyMockSyncEvent).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ type: 'payment.succeeded' }),
      'icount',
    );
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
});

describe('process-refund provider isolation (I4-T3, I4-T4)', () => {
  const service = {} as never;

  beforeEach(() => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
  });

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
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
});

describe('Grow regression (I4 mock DoD)', () => {
  it('grow-renewal-charge and grow-refund test files remain importable', async () => {
    await expect(import('./grow-renewal-charge.test.ts')).resolves.toBeDefined();
    await expect(import('./grow-refund.test.ts')).resolves.toBeDefined();
  });
});
