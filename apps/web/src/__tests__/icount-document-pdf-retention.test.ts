/**
 * I4a-T1 — iCount official document fixture stores PDF when fetch succeeds.
 * Run: pnpm -C apps/web test icount-document-pdf-retention.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleInvoiceEventInternal } from '../../../../supabase/functions/_shared/payments/handle-invoice-event.ts';
import icountDocumentFixture from './fixtures/icount-document-webhook-official-example.json';

const ICOUNT_TENANT = '00000000-0000-0000-0000-0000000000bb';
const PAYMENT_REF = '455544545';
const DOC_ID = 'invrec_3006';
const PDF_URL = 'https://s3.amazonaws.com/icount-pdfs/REDACTED_example.pdf';

function makeService() {
  const paymentUpdates: Record<string, unknown>[] = [];

  const service = {
    from(table: string) {
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

      if (table === 'payments') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              eq: (_col2: string, val2: string) => ({
                maybeSingle: async () =>
                  val === ICOUNT_TENANT && val2 === PAYMENT_REF
                    ? {
                        data: { id: 'pay-icount', external_document_id: null },
                        error: null,
                      }
                    : { data: null, error: null },
              }),
              maybeSingle: async () =>
                val === PAYMENT_REF
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

describe('iCount document PDF retention (I4a-T1)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores pdf_link as invoice_url and document_pdf_path when fetch succeeds', async () => {
    const { service, paymentUpdates } = makeService();
    const expectedPath = `documents/${ICOUNT_TENANT}/${PAYMENT_REF}/${DOC_ID}.pdf`;

    const result = await handleInvoiceEventInternal(
      service,
      JSON.stringify(icountDocumentFixture),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paymentId).toBe('pay-icount');
    }
    expect(paymentUpdates[0]).toMatchObject({
      external_document_id: DOC_ID,
      invoice_url: PDF_URL,
      document_pdf_path: expectedPath,
      document_stored_at: expect.any(String),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(PDF_URL, {
      signal: expect.any(AbortSignal),
    });
  });

  it('stores invoice_url only when PDF fetch fails (non-fatal)', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const { service, paymentUpdates } = makeService();

    const result = await handleInvoiceEventInternal(
      service,
      JSON.stringify(icountDocumentFixture),
    );

    expect(result.ok).toBe(true);
    expect(paymentUpdates[0]).toMatchObject({
      external_document_id: DOC_ID,
      invoice_url: PDF_URL,
      document_pdf_path: null,
      document_stored_at: expect.any(String),
    });
  });
});
