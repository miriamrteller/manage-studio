/**
 * I2a: mock payment → document webhook path for iCount bundled flow.
 * Run: pnpm -C apps/web test icount-mock-document-path.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { confirmMockPayment, buildChargeMetadata } from '../../../../supabase/functions/_shared/payments/providers/mock.ts';
import { handleInvoiceEventInternal } from '../../../../supabase/functions/_shared/payments/handle-invoice-event.ts';
import { buildMockIcountDocumentWebhookBody } from '../../../../supabase/functions/_shared/payments/icount/document.ts';

vi.mock('../../../../supabase/functions/_shared/payments/handle-payment-event.ts', () => ({
  handlePaymentEventInternal: vi.fn(async () => ({
    paymentId: 'pay-mock-icount',
    duplicate: false,
  })),
}));

const ICOUNT_TENANT = '00000000-0000-0000-0000-0000000000bb';
const ENGAGEMENT_ID = '00000000-0000-0000-0000-000000001001';
const BILLING_ACCOUNT_ID = '00000000-0000-0000-0000-000000000408';
const OFFERING_ID = '00000000-0000-0000-0000-000000000311';
const PERSON_ID = '00000000-0000-0000-0000-000000000501';
const MOCK_PAYMENT_REF = 'mockicount_test_ref';

function makeDocumentService() {
  const paymentUpdates: Record<string, unknown>[] = [];

  const service = {
    from(table: string) {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              eq: (_col2: string, val2: string) => ({
                maybeSingle: async () =>
                  val === ICOUNT_TENANT && val2 === MOCK_PAYMENT_REF
                    ? {
                        data: { id: 'pay-mock-icount', external_document_id: null },
                        error: null,
                      }
                    : { data: null, error: null },
              }),
              maybeSingle: async () =>
                val === MOCK_PAYMENT_REF
                  ? { data: { tenant_id: ICOUNT_TENANT }, error: null }
                  : { data: null, error: null },
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            paymentUpdates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { invoicing_provider: 'icount' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        update: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }),
      };
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
      }),
    },
  } as never;

  return { service, paymentUpdates };
}

describe('confirm-mock-payment + mock iCount document webhook', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirm-mock-payment delegates to handlePaymentEventInternal with icount slug', async () => {
    const { handlePaymentEventInternal } = await import(
      '../../../../supabase/functions/_shared/payments/handle-payment-event.ts'
    );
    const service = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) } as never;
    const metadata = buildChargeMetadata({
      tenantId: ICOUNT_TENANT,
      engagementId: ENGAGEMENT_ID,
      billingAccountId: BILLING_ACCOUNT_ID,
      offeringId: OFFERING_ID,
      personId: PERSON_ID,
      vatRate: 0,
      pretaxMinor: 0,
      vatMinor: 0,
      totalMinor: 35000,
    });

    const confirm = await confirmMockPayment({
      service,
      metadata,
      amountMinor: 35000,
      currency: 'ILS',
      scenario: 'success',
      providerSlug: 'icount',
      providerPaymentRef: MOCK_PAYMENT_REF,
    });

    expect(confirm.ok).toBe(true);
    expect(handlePaymentEventInternal).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ type: 'payment.succeeded' }),
      'icount',
    );
  });

  it('handleInvoiceEventInternal applies mock document body after payment ref is known', async () => {
    const { service, paymentUpdates } = makeDocumentService();
    const docBody = buildMockIcountDocumentWebhookBody({
      providerPaymentRef: MOCK_PAYMENT_REF,
    });

    const docResult = await handleInvoiceEventInternal(service, JSON.stringify(docBody));

    expect(docResult.ok).toBe(true);
    if (docResult.ok) {
      expect(docResult.paymentId).toBe('pay-mock-icount');
    }
    expect(paymentUpdates[0]).toMatchObject({ external_document_id: 'invrec_3006' });
    expect(paymentUpdates[0]).toMatchObject({
      document_pdf_path: `documents/${ICOUNT_TENANT}/${MOCK_PAYMENT_REF}/invrec_3006.pdf`,
      document_stored_at: expect.any(String),
    });
  });
});
