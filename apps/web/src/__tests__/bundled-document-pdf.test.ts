/**
 * I4a — shared PDF fetch/storage for bundled document webhooks.
 * Run: pnpm -C apps/web test bundled-document-pdf.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAndStoreBundledDocumentPdf } from '../../../../supabase/functions/_shared/payments/bundled-document-pdf.ts';
import { handlePaymentDocumentInternal } from '../../../../supabase/functions/_shared/payments/handle-payment-document.ts';
import growInvoiceNotify from './fixtures/grow-invoice-notify.json';

const TENANT_ID = '00000000-0000-0000-0000-0000000000aa';
const PAYMENT_REF = 'idem_11111111-1111-1111-1111-111111111111';
const DOC_ID = 'DOC-555000';
const PDF_URL = 'https://sandbox.meshulam.co.il/docs/redacted.pdf';

function makeStorageService(uploadImpl?: () => Promise<{ error: unknown }>) {
  const uploads: { path: string; bytes: ArrayBuffer; options: Record<string, unknown> }[] = [];

  const service = {
    storage: {
      from: () => ({
        upload: async (path: string, bytes: ArrayBuffer, options: Record<string, unknown>) => {
          uploads.push({ path, bytes, options });
          if (uploadImpl) return uploadImpl();
          return { error: null };
        },
      }),
    },
  } as never;

  return { service, uploads };
}

describe('fetchAndStoreBundledDocumentPdf (I4a-T1 helper)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns storage path on successful fetch and upload', async () => {
    const { service, uploads } = makeStorageService();

    const result = await fetchAndStoreBundledDocumentPdf(service, {
      tenantId: TENANT_ID,
      providerPaymentRef: PAYMENT_REF,
      externalDocumentId: DOC_ID,
      documentUrl: PDF_URL,
    });

    const expectedPath = `documents/${TENANT_ID}/${PAYMENT_REF}/${DOC_ID}.pdf`;
    expect(result.pdfPath).toBe(expectedPath);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe(expectedPath);
    expect(uploads[0].options).toMatchObject({
      contentType: 'application/pdf',
      upsert: false,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(PDF_URL, {
      signal: expect.any(AbortSignal),
    });
  });

  it('returns null path when fetch fails (non-fatal)', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const { service, uploads } = makeStorageService();

    const result = await fetchAndStoreBundledDocumentPdf(service, {
      tenantId: TENANT_ID,
      providerPaymentRef: PAYMENT_REF,
      externalDocumentId: DOC_ID,
      documentUrl: PDF_URL,
    });

    expect(result.pdfPath).toBeNull();
    expect(uploads).toHaveLength(0);
  });

  it('returns null path when upload fails (non-fatal)', async () => {
    const { service } = makeStorageService(async () => ({
      error: { message: 'duplicate' },
    }));

    const result = await fetchAndStoreBundledDocumentPdf(service, {
      tenantId: TENANT_ID,
      providerPaymentRef: PAYMENT_REF,
      externalDocumentId: DOC_ID,
      documentUrl: PDF_URL,
    });

    expect(result.pdfPath).toBeNull();
  });
});

describe('handlePaymentDocumentInternal (I4a-T3)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses shared PDF helper and returns ok with document fields', async () => {
    const paymentUpdates: Record<string, unknown>[] = [];
    const expectedPath = `documents/${TENANT_ID}/${PAYMENT_REF}/${DOC_ID}.pdf`;

    const service = {
      from: (table: string) => {
        if (table === 'payments') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'pay-grow', external_document_id: null },
                    error: null,
                  }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              paymentUpdates.push(payload);
              return { eq: async () => ({ error: null }) };
            },
          };
        }
        return {};
      },
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
        }),
      },
    } as never;

    const result = await handlePaymentDocumentInternal(
      service,
      growInvoiceNotify as Record<string, unknown>,
    );

    expect(result).toEqual({ ok: true });
    expect(paymentUpdates[0]).toMatchObject({
      external_document_id: DOC_ID,
      invoice_url: PDF_URL,
      document_pdf_path: expectedPath,
      document_stored_at: expect.any(String),
    });
  });

  it('returns duplicate without re-upload when external_document_id matches', async () => {
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'pay-grow', external_document_id: DOC_ID },
                error: null,
              }),
            }),
          }),
        }),
      }),
      storage: { from: () => ({ upload: vi.fn() }) },
    } as never;

    const result = await handlePaymentDocumentInternal(
      service,
      growInvoiceNotify as Record<string, unknown>,
    );

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
