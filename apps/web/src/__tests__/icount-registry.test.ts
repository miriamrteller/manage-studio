/**
 * I1: iCount registered in payment + invoicing registries; MockIcount adapter behaviour.
 * Run: pnpm -C apps/web test icount-registry.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  PAYMENT_PROVIDER_SLUGS,
  parsePaymentProviderSlug,
} from '../../../../supabase/functions/_shared/payments/registry.ts';
import {
  INVOICING_PROVIDER_SLUGS,
  parseInvoicingProviderSlug,
} from '../../../../supabase/functions/_shared/invoicing/registry.ts';
import { getPaymentProvider } from '../../../../supabase/functions/_shared/payments/index.ts';
import { getInvoicingProvider } from '../../../../supabase/functions/_shared/invoicing/index.ts';
import { MockIcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-icount.ts';
import { IcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/icount.ts';
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { StripePaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/stripe.ts';
import { IcountInvoicingProvider } from '../../../../supabase/functions/_shared/invoicing/providers/icount.ts';
import { buildChargeMetadata } from '../../../../supabase/functions/_shared/payments/providers/mock.ts';

const metadata = buildChargeMetadata({
  tenantId: '00000000-0000-0000-0000-000000000001',
  engagementId: '00000000-0000-0000-0000-000000001001',
  billingAccountId: '00000000-0000-0000-0000-000000000408',
  offeringId: '00000000-0000-0000-0000-000000000311',
  personId: '00000000-0000-0000-0000-000000000501',
  vatRate: 0.17,
  pretaxMinor: 85,
  vatMinor: 15,
  totalMinor: 100,
});

describe('iCount registries (I1-T1, I1-T2)', () => {
  it('accepts icount as a payment provider slug', () => {
    expect(PAYMENT_PROVIDER_SLUGS).toContain('icount');
    expect(parsePaymentProviderSlug('icount')).toBe('icount');
  });

  it('accepts icount as an invoicing provider slug', () => {
    expect(INVOICING_PROVIDER_SLUGS).toContain('icount');
    expect(parseInvoicingProviderSlug('icount')).toBe('icount');
  });

  it('still accepts grow slugs (regression)', () => {
    expect(parsePaymentProviderSlug('grow')).toBe('grow');
    expect(parseInvoicingProviderSlug('grow')).toBe('grow');
  });
});

describe('MockIcountPaymentProvider', () => {
  it('issues a hosted-page charge on mock.icount.local without auto-finalising', async () => {
    const provider = new MockIcountPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 100,
      currency: 'ILS',
      idempotencyKey: 'idem-icount-1',
      metadata,
    });

    expect(result.providerPaymentRef).toMatch(/^mockicount_/);
    expect(result.pageUrl).toContain('mock.icount.local');
    expect(result.pageUrl).toContain('m__tenant_id=');
    expect(result.pendingWebhook).toBe(true);
    expect(result.emitSyncEvent).toBeUndefined();
  });
});

describe('getPaymentProvider icount selection', () => {
  const service = {} as never;

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
  });

  it('returns MockIcount when ICOUNT_MOCK=true', () => {
    process.env.ICOUNT_MOCK = 'true';
    const provider = getPaymentProvider(service, 'icount');
    expect(provider).toBeInstanceOf(MockIcountPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockGrowPaymentProvider);
  });

  it('returns live IcountPaymentProvider when ICOUNT_MOCK is unset', () => {
    const provider = getPaymentProvider(service, 'icount');
    expect(provider).toBeInstanceOf(IcountPaymentProvider);
    expect(provider.slug).toBe('icount');
  });
});

describe('getInvoicingProvider icount', () => {
  it('returns IcountInvoicingProvider for icount slug', () => {
    const provider = getInvoicingProvider('icount');
    expect(provider).toBeInstanceOf(IcountInvoicingProvider);
    expect(provider.slug).toBe('icount');
  });
});

describe('getPaymentProvider stripe isolation (I1-T5)', () => {
  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
  });

  it('never returns Grow or Icount mocks for stripe', () => {
    process.env.GROW_MOCK = 'true';
    process.env.ICOUNT_MOCK = 'true';
    const provider = getPaymentProvider({} as never, 'stripe');
    expect(provider).toBeInstanceOf(StripePaymentProvider);
    expect(provider).not.toBeInstanceOf(MockGrowPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockIcountPaymentProvider);
  });
});
