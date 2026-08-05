/**
 * Tranzila + Yesh are selectable providers in the main architecture.
 *
 * Run: pnpm -C apps/web test tranzila-yesh-registry.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  PAYMENT_PROVIDER_SLUGS,
  parsePaymentProviderSlug,
} from '../../../../supabase/functions/_shared/payments/registry.ts';
import {
  INVOICING_PROVIDER_SLUGS,
  parseInvoicingProviderSlug,
} from '../../../../supabase/functions/_shared/invoicing/registry.ts';
import { MockTranzilaPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-tranzila-payment.ts';

describe('tenant-selectable provider slugs', () => {
  // The set a tenant may choose from. Stripe stays parseable but is not offered —
  // it is not viable for Israeli-only businesses.
  it('offers every payment provider we support', () => {
    for (const slug of ['grow', 'icount', 'invoice4u', 'ypay', 'tranzila']) {
      expect(PAYMENT_PROVIDER_SLUGS).toContain(slug);
      expect(parsePaymentProviderSlug(slug)).toBe(slug);
    }
  });

  it('offers every invoicing provider we support', () => {
    for (const slug of ['green_invoice', 'grow', 'icount', 'invoice4u', 'ypay', 'tranzila', 'yesh']) {
      expect(INVOICING_PROVIDER_SLUGS).toContain(slug);
      expect(parseInvoicingProviderSlug(slug)).toBe(slug);
    }
  });

  it('rejects an unknown provider rather than defaulting silently', () => {
    expect(() => parsePaymentProviderSlug('paypal')).toThrow();
  });

  // Rapyd was removed entirely — it must not be selectable again by accident.
  it('no longer accepts rapyd', () => {
    expect(PAYMENT_PROVIDER_SLUGS).not.toContain('rapyd');
    expect(() => parsePaymentProviderSlug('rapyd')).toThrow();
  });
});

describe('MockTranzilaPaymentProvider', () => {
  const service = {} as never;
  const meta = {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    engagement_id: '00000000-0000-0000-0000-000000000002',
    billing_account_id: '00000000-0000-0000-0000-000000000003',
    charge_type: 'initial' as const,
  };

  it('returns a hosted redirect and defers to the webhook', async () => {
    const result = await new MockTranzilaPaymentProvider(service).createCharge({
      amountMinor: 35000,
      currency: 'ILS',
      idempotencyKey: 'idem-1',
      metadata: meta,
    });

    expect(result.pageUrl).toMatch(/^https:\/\/mock\.tranzila\.local\/pay\//);
    expect(result.pendingWebhook).toBe(true);
  });

  it('rejects an invalid mock signature', async () => {
    await expect(
      new MockTranzilaPaymentProvider(service).constructEvent('{}', new Headers(), 't'),
    ).rejects.toThrow(/signature/);
  });
});
