/**
 * U1: Invoice4U registered in payment + invoicing registries; mock adapter behaviour.
 * Run: pnpm -C apps/web test invoice4u-registry.test.ts
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
import { MockInvoice4uPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-invoice4u.ts';
import { Invoice4uPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/invoice4u.ts';
import { MockGrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-grow.ts';
import { MockIcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-icount.ts';
import { Invoice4uInvoicingProvider } from '../../../../supabase/functions/_shared/invoicing/providers/invoice4u.ts';
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

describe('Invoice4U registries (U1)', () => {
  it('accepts invoice4u as a payment provider slug', () => {
    expect(PAYMENT_PROVIDER_SLUGS).toContain('invoice4u');
    expect(parsePaymentProviderSlug('invoice4u')).toBe('invoice4u');
  });

  it('accepts invoice4u as an invoicing provider slug', () => {
    expect(INVOICING_PROVIDER_SLUGS).toContain('invoice4u');
    expect(parseInvoicingProviderSlug('invoice4u')).toBe('invoice4u');
  });

  it('still accepts grow and icount slugs (regression)', () => {
    expect(parsePaymentProviderSlug('grow')).toBe('grow');
    expect(parsePaymentProviderSlug('icount')).toBe('icount');
    expect(parseInvoicingProviderSlug('grow')).toBe('grow');
    expect(parseInvoicingProviderSlug('icount')).toBe('icount');
  });
});

describe('MockInvoice4uPaymentProvider', () => {
  it('issues a hosted-page charge on mock.invoice4u.local without auto-finalising', async () => {
    const provider = new MockInvoice4uPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 100,
      currency: 'ILS',
      idempotencyKey: 'idem-invoice4u-1',
      metadata,
    });

    expect(result.providerPaymentRef).toMatch(/^mockinvoice4u_/);
    expect(result.pageUrl).toContain('mock.invoice4u.local');
    expect(result.pendingWebhook).toBe(true);
    expect(result.emitSyncEvent).toBeUndefined();
  });

  it('auto-finalises saved-token charges for mock renewals', async () => {
    const provider = new MockInvoice4uPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 100,
      currency: 'ILS',
      idempotencyKey: 'idem-invoice4u-renewal',
      metadata,
      savedToken: 'mock_saved_token',
    });

    expect(result.emitSyncEvent?.type).toBe('payment.succeeded');
    expect(result.emitSyncEvent?.providerPaymentRef).toBe(result.providerPaymentRef);
    expect(result.emitSyncEvent?.amountMinor).toBe(100);
  });

  it('chargeWithToken returns emitSyncEvent for renewals', async () => {
    const provider = new MockInvoice4uPaymentProvider();
    const result = await provider.chargeWithToken({
      amountMinor: 100,
      currency: 'ILS',
      idempotencyKey: 'renew-1',
      metadata: { ...metadata, charge_type: 'renewal' },
      savedToken: 'i4u_customer_1',
    });

    expect(result.emitSyncEvent?.type).toBe('payment.succeeded');
    expect(result.providerPaymentRef).toMatch(/^mockinvoice4u_/);
  });
});

describe('getPaymentProvider invoice4u selection', () => {
  const service = {} as never;

  afterEach(() => {
    delete process.env.GROW_MOCK;
    delete process.env.ICOUNT_MOCK;
    delete process.env.INVOICE4U_MOCK;
  });

  it('returns MockInvoice4u when INVOICE4U_MOCK=true', () => {
    process.env.INVOICE4U_MOCK = 'true';
    const provider = getPaymentProvider(service, 'invoice4u');
    expect(provider).toBeInstanceOf(MockInvoice4uPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockGrowPaymentProvider);
    expect(provider).not.toBeInstanceOf(MockIcountPaymentProvider);
  });

  it('returns live Invoice4uPaymentProvider when INVOICE4U_MOCK is unset', () => {
    const provider = getPaymentProvider(service, 'invoice4u');
    expect(provider).toBeInstanceOf(Invoice4uPaymentProvider);
    expect(provider.slug).toBe('invoice4u');
  });
});

describe('getInvoicingProvider invoice4u', () => {
  it('returns Invoice4uInvoicingProvider for invoice4u slug', () => {
    const provider = getInvoicingProvider('invoice4u');
    expect(provider).toBeInstanceOf(Invoice4uInvoicingProvider);
    expect(provider.slug).toBe('invoice4u');
  });

  it('issueDocument throws non-retryable bundled error', async () => {
    const provider = getInvoicingProvider('invoice4u');
    await expect(
      provider.issueDocument({} as never, {
        tenantId: metadata.tenant_id,
        paymentId: '00000000-0000-0000-0000-000000000099',
        documentKind: 'sale',
        language: 'he',
        currency: 'ILS',
        totalAmountMinor: 100,
        pretaxAmountMinor: 85,
        vatAmountMinor: 15,
        vatRate: 0.17,
        payer: { name: 'Test' },
      }),
    ).rejects.toMatchObject({ retryable: false });
  });
});
