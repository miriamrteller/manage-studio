/**
 * G4b: the Grow document webhook upserts document fields idempotently and settles the queue.
 * Run: pnpm -C apps/web test handle-invoice-event.test.ts
 */
import { describe, it, expect } from 'vitest';
import { applyGrowInvoiceNotify } from '../../../../supabase/functions/_shared/payments/grow/invoice.ts';
import type { ParsedGrowInvoice } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';

const parsed: ParsedGrowInvoice = {
  tenantId: '00000000-0000-0000-0000-0000000000aa',
  providerPaymentRef: 'idem_1',
  externalDocumentId: 'DOC-555000',
  externalDocumentNumber: 'INV-2026-0042',
  documentUrl: 'https://sandbox.meshulam.co.il/docs/redacted.pdf',
};

function makeService(payment: { id: string; external_document_id: string | null } | null) {
  const paymentUpdates: Record<string, unknown>[] = [];
  const queueUpdates: Record<string, unknown>[] = [];
  const service = {
    from(table: string) {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }),
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

describe('applyGrowInvoiceNotify', () => {
  it('writes document fields and settles the queue on first delivery', async () => {
    const { service, paymentUpdates, queueUpdates } = makeService({
      id: 'pay-1',
      external_document_id: null,
    });

    const result = await applyGrowInvoiceNotify(service, parsed);

    expect(result).toEqual({ status: 'applied', paymentId: 'pay-1' });
    expect(paymentUpdates[0]).toMatchObject({
      external_document_id: 'DOC-555000',
      external_document_number: 'INV-2026-0042',
      invoice_url: parsed.documentUrl,
    });
    expect(queueUpdates[0]).toMatchObject({ status: 'succeeded' });
  });

  it('is idempotent when the document was already written', async () => {
    const { service, paymentUpdates } = makeService({
      id: 'pay-1',
      external_document_id: 'DOC-555000',
    });

    const result = await applyGrowInvoiceNotify(service, parsed);

    expect(result).toEqual({ status: 'duplicate', paymentId: 'pay-1' });
    expect(paymentUpdates).toHaveLength(0);
  });

  it('reports payment_not_found when no payment matches', async () => {
    const { service } = makeService(null);
    const result = await applyGrowInvoiceNotify(service, parsed);
    expect(result).toEqual({ status: 'payment_not_found' });
  });
});
