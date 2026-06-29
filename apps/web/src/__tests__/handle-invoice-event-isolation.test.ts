/**
 * I2a provider isolation — document webhook dispatch by invoicing_provider slug.
 * Run: pnpm -C apps/web test handle-invoice-event-isolation.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleInvoiceEventInternal } from '../../../../supabase/functions/_shared/payments/handle-invoice-event.ts';
import * as growProvider from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import * as icountDocument from '../../../../supabase/functions/_shared/payments/icount/document.ts';
import growInvoiceNotify from './fixtures/grow-invoice-notify.json';
import icountDocumentFixture from './fixtures/icount-document-webhook-official-example.json';

const GROW_TENANT = '00000000-0000-0000-0000-0000000000aa';
const ICOUNT_TENANT = '00000000-0000-0000-0000-0000000000bb';
const PAYMENT_REF = '455544545';

type PaymentRow = {
  id: string;
  tenant_id: string;
  provider_payment_ref: string;
  external_document_id: string | null;
};

function makeService(options: {
  invoicingProvider: string;
  tenantId: string;
  payment?: PaymentRow | null;
  paymentByRef?: PaymentRow | null;
}) {
  const paymentUpdates: Record<string, unknown>[] = [];
  const queueUpdates: Record<string, unknown>[] = [];

  const payment =
    options.payment ??
    (options.paymentByRef
      ? options.paymentByRef
      : {
          id: 'pay-1',
          tenant_id: options.tenantId,
          provider_payment_ref: PAYMENT_REF,
          external_document_id: null,
        });

  const routingPayment = options.paymentByRef ?? payment;

  const service = {
    from(table: string) {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { invoicing_provider: options.invoicingProvider },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'payments') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              eq: (_col2: string, val2: string) => ({
                maybeSingle: async () => {
                  if (
                    payment &&
                    payment.tenant_id === val &&
                    payment.provider_payment_ref === val2
                  ) {
                    return {
                      data: {
                        id: payment.id,
                        external_document_id: payment.external_document_id,
                      },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                },
              }),
              maybeSingle: async () => {
                if (routingPayment && routingPayment.provider_payment_ref === val) {
                  return { data: { tenant_id: routingPayment.tenant_id }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            paymentUpdates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }

      return {
        update: (payload: Record<string, unknown>) => {
          queueUpdates.push(payload);
          return { eq: () => ({ in: async () => ({ error: null }) }) };
        },
      };
    },
  } as never;

  return { service, paymentUpdates, queueUpdates };
}

describe('handle-invoice-event isolation (I2a-T1 … I2a-T4)', () => {
  beforeEach(() => {
    vi.spyOn(growProvider, 'parseGrowInvoiceNotify');
    vi.spyOn(icountDocument, 'parseIcountDocumentWebhook');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('I2a-T1: Grow fixture on grow tenant uses Grow parser and applies document fields', async () => {
    const { service, paymentUpdates } = makeService({
      invoicingProvider: 'grow',
      tenantId: GROW_TENANT,
      payment: {
        id: 'pay-grow',
        tenant_id: GROW_TENANT,
        provider_payment_ref: 'idem_11111111-1111-1111-1111-111111111111',
        external_document_id: null,
      },
    });

    const result = await handleInvoiceEventInternal(
      service,
      JSON.stringify(growInvoiceNotify),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paymentId).toBe('pay-grow');
      expect(result.duplicate).toBe(false);
    }
    expect(growProvider.parseGrowInvoiceNotify).toHaveBeenCalled();
    expect(icountDocument.parseIcountDocumentWebhook).not.toHaveBeenCalled();
    expect(paymentUpdates[0]).toMatchObject({ external_document_id: 'DOC-555000' });
  });

  it('I2a-T2: iCount fixture on icount tenant uses iCount parser only', async () => {
    const { service, paymentUpdates } = makeService({
      invoicingProvider: 'icount',
      tenantId: ICOUNT_TENANT,
      paymentByRef: {
        id: 'pay-icount',
        tenant_id: ICOUNT_TENANT,
        provider_payment_ref: PAYMENT_REF,
        external_document_id: null,
      },
    });

    const result = await handleInvoiceEventInternal(
      service,
      JSON.stringify(icountDocumentFixture),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paymentId).toBe('pay-icount');
    }
    expect(icountDocument.parseIcountDocumentWebhook).toHaveBeenCalled();
    expect(growProvider.parseGrowInvoiceNotify).not.toHaveBeenCalled();
    expect(paymentUpdates[0]).toMatchObject({ external_document_id: 'invrec_3006' });
  });

  it('I2a-T3: iCount fixture on grow tenant returns 400 without Grow apply', async () => {
    const { service, paymentUpdates } = makeService({
      invoicingProvider: 'grow',
      tenantId: GROW_TENANT,
      paymentByRef: {
        id: 'pay-grow',
        tenant_id: GROW_TENANT,
        provider_payment_ref: PAYMENT_REF,
        external_document_id: null,
      },
    });

    const result = await handleInvoiceEventInternal(
      service,
      JSON.stringify(icountDocumentFixture),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
    expect(growProvider.parseGrowInvoiceNotify).not.toHaveBeenCalled();
    expect(icountDocument.parseIcountDocumentWebhook).not.toHaveBeenCalled();
    expect(paymentUpdates).toHaveLength(0);
  });

  it('I2a-T4: Grow fixture on icount tenant returns 400 without writing Grow fields', async () => {
    const growBody = {
      ...growInvoiceNotify,
      data: {
        ...(growInvoiceNotify as { data: Record<string, unknown> }).data,
        cField1: ICOUNT_TENANT,
      },
    };

    const { service, paymentUpdates } = makeService({
      invoicingProvider: 'icount',
      tenantId: ICOUNT_TENANT,
      payment: {
        id: 'pay-icount',
        tenant_id: ICOUNT_TENANT,
        provider_payment_ref: 'idem_11111111-1111-1111-1111-111111111111',
        external_document_id: null,
      },
    });

    const result = await handleInvoiceEventInternal(service, JSON.stringify(growBody));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
    expect(growProvider.parseGrowInvoiceNotify).not.toHaveBeenCalled();
    expect(icountDocument.parseIcountDocumentWebhook).not.toHaveBeenCalled();
    expect(paymentUpdates).toHaveLength(0);
  });
});

describe('I2a-T5 — Grow regression', () => {
  it('grow-webhook-parse.test.ts remains the Grow parse contract (import smoke)', async () => {
    const { parseGrowInvoiceNotify } = await import(
      '../../../../supabase/functions/_shared/payments/providers/grow.ts'
    );
    const parsed = parseGrowInvoiceNotify(growInvoiceNotify as Record<string, unknown>);
    expect(parsed.externalDocumentId).toBe('DOC-555000');
  });
});
