/**
 * G3: Grow is registered in the payment + invoicing registries, the mock Grow adapter
 * produces a webhook-style PaymentEvent, and the factory only returns the mock when GROW_MOCK.
 * Run: pnpm -C apps/web test grow-registry.test.ts
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
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import { buildChargeMetadata } from '../../../../supabase/functions/_shared/payments/providers/mock.ts';

const metadata = buildChargeMetadata({
  tenantId: '00000000-0000-0000-0000-000000000001',
  engagementId: '00000000-0000-0000-0000-000000001001',
  billingAccountId: '00000000-0000-0000-0000-000000000408',
  offeringId: '00000000-0000-0000-0000-000000000313',
  personId: '00000000-0000-0000-0000-000000000501',
  vatRate: 0.17,
  pretaxMinor: 85,
  vatMinor: 15,
  totalMinor: 100,
});

describe('Grow registries', () => {
  it('accepts grow as a payment provider slug', () => {
    expect(PAYMENT_PROVIDER_SLUGS).toContain('grow');
    expect(parsePaymentProviderSlug('grow')).toBe('grow');
  });

  it('accepts grow as an invoicing provider slug', () => {
    expect(INVOICING_PROVIDER_SLUGS).toContain('grow');
    expect(parseInvoicingProviderSlug('grow')).toBe('grow');
  });

  it('rejects an unknown payment provider slug', () => {
    expect(() => parsePaymentProviderSlug('paypal')).toThrow();
  });
});

describe('MockGrowPaymentProvider', () => {
  it('issues a hosted-page charge without auto-finalising (parent confirms via mock card UI)', async () => {
    const provider = new MockGrowPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 100,
      currency: 'ILS',
      idempotencyKey: 'idem-1',
      metadata,
    });

    expect(result.providerPaymentRef).toMatch(/^mockgrow_/);
    expect(result.pageUrl).toContain(result.providerPaymentRef);
    expect(result.pendingWebhook).toBe(true);
    expect(result.emitSyncEvent).toBeUndefined();
  });

  it('auto-finalises saved-token charges for mock renewals', async () => {
    const provider = new MockGrowPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 100,
      currency: 'ILS',
      idempotencyKey: 'idem-renewal',
      metadata,
      savedToken: 'mock_saved_token',
    });

    expect(result.emitSyncEvent?.type).toBe('payment.succeeded');
    expect(result.emitSyncEvent?.providerPaymentRef).toBe(result.providerPaymentRef);
    expect(result.emitSyncEvent?.amountMinor).toBe(100);
  });
});

describe('getPaymentProvider grow selection', () => {
  const service = {} as never;

  afterEach(() => {
    delete process.env.GROW_MOCK;
  });

  it('returns the mock Grow provider when GROW_MOCK=true', () => {
    process.env.GROW_MOCK = 'true';
    const provider = getPaymentProvider(service, 'grow');
    expect(provider).toBeInstanceOf(MockGrowPaymentProvider);
  });

  it('returns the real Grow provider when GROW_MOCK is unset', () => {
    const provider = getPaymentProvider(service, 'grow');
    expect(provider).toBeInstanceOf(GrowPaymentProvider);
    expect(provider.slug).toBe('grow');
  });
});
