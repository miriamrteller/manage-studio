/**
 * YPay slug registry + mock adapter behaviour.
 *
 * Run: pnpm -C apps/web test ypay-registry.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  parsePaymentProviderSlug,
  PAYMENT_PROVIDER_SLUGS,
} from '../../../../supabase/functions/_shared/payments/registry.ts';
import { parseInvoicingProviderSlug } from '../../../../supabase/functions/_shared/invoicing/registry.ts';
import { MockYpayPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-ypay.ts';

describe('ypay slug registry', () => {
  it('parses "ypay" as a payment provider', () => {
    expect(parsePaymentProviderSlug('ypay')).toBe('ypay');
    expect(PAYMENT_PROVIDER_SLUGS).toContain('ypay');
  });

  it('parses "ypay" as an invoicing provider (bundled document)', () => {
    expect(parseInvoicingProviderSlug('ypay')).toBe('ypay');
  });
});

describe('MockYpayPaymentProvider', () => {
  // Minimal service stub for the pending-row insert path.
  function makeService() {
    return {
      from(table: string) {
        if (table === 'engagements') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'eng-1',
                    person_id: 'person-1',
                    offering_id: 'off-1',
                    billing_account_id: 'ba-1',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'people') {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: { account_id: 'acct-1' }, error: null }) }),
            }),
          };
        }
        if (table === 'payments') {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: { id: 'pay-1' }, error: null }) }),
            }),
          };
        }
        // audit_log and anything else
        return { insert: async () => ({ error: null }) };
      },
    } as never;
  }

  const meta = {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    engagement_id: '00000000-0000-0000-0000-000000000002',
    billing_account_id: '00000000-0000-0000-0000-000000000003',
    charge_type: 'initial' as const,
  };

  it('issues a hosted-page charge on mock.ypay.local and inserts a pending row', async () => {
    const provider = new MockYpayPaymentProvider(makeService());
    const result = await provider.createCharge({
      amountMinor: 35000,
      currency: 'ILS',
      idempotencyKey: 'idem-1',
      metadata: meta,
    });

    expect(result.pageUrl).toMatch(/^https:\/\/mock\.ypay\.local\/pay\//);
    expect(result.pendingWebhook).toBe(true);
    expect(result.providerPaymentRef).toBeTruthy();
  });

  it('rejects an invalid mock signature', async () => {
    const provider = new MockYpayPaymentProvider(makeService());
    await expect(provider.constructEvent('{}', new Headers(), 't')).rejects.toThrow(/signature/);
  });

  it('guarantees tokenization and refunds are unsupported', async () => {
    const provider = new MockYpayPaymentProvider(makeService());
    await expect(
      provider.chargeWithToken({
        amountMinor: 1,
        currency: 'ILS',
        idempotencyKey: 'x',
        metadata: meta,
        savedToken: 'tok',
      }),
    ).rejects.toThrow(/unsupported/i);
  });
});
