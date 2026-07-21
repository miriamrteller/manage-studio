/**
 * Every tax document must land on payments + audit_log (all providers).
 * Run: pnpm -C apps/web test bundled-document-persist.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../supabase/functions/_shared/payments/send-payment-document-admin-email.ts', () => ({
  sendPaymentDocumentAdminEmail: vi.fn(async () => ({ sent: true })),
  PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT: 'payment_document_admin_email_sent',
  PAYMENT_DOCUMENT_ADMIN_EMAIL_FAILED: 'payment_document_admin_email_failed',
  PAYMENT_DOCUMENT_ADMIN_EMAIL_SKIPPED: 'payment_document_admin_email_skipped',
}));

import {
  PAYMENT_DOCUMENT_RECORDED,
  applyBundledDocumentNotify,
  persistPaymentDocumentFields,
} from '../../../../supabase/functions/_shared/payments/bundled-document.ts';
import { sendPaymentDocumentAdminEmail } from '../../../../supabase/functions/_shared/payments/send-payment-document-admin-email.ts';

const TENANT_ID = '00000000-0000-0000-0000-0000000000aa';
const PAYMENT_ID = 'pay-1';
const PAYMENT_REF = 'ref-1';
const DOC_ID = 'DOC-1';
const PDF_URL = 'https://example.test/doc.pdf';

function makeService(opts?: {
  existingDocId?: string | null;
  paymentFound?: boolean;
}) {
  const paymentUpdates: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const queueUpdates: Record<string, unknown>[] = [];
  const existingDocId = opts?.existingDocId ?? null;
  const paymentFound = opts?.paymentFound ?? true;

  const service = {
    from: (table: string) => {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: paymentFound
                    ? { id: PAYMENT_ID, external_document_id: existingDocId }
                    : null,
                  error: null,
                }),
              }),
              maybeSingle: async () => ({
                data: paymentFound
                  ? { id: PAYMENT_ID, external_document_id: existingDocId }
                  : null,
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            paymentUpdates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            audits.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'document_queue') {
        return {
          update: (payload: Record<string, unknown>) => {
            queueUpdates.push(payload);
            return {
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            };
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

  return { service, paymentUpdates, audits, queueUpdates };
}

describe('persistPaymentDocumentFields', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes payment document columns and audit_log trail', async () => {
    const { service, paymentUpdates, audits } = makeService({ existingDocId: null });

    const result = await persistPaymentDocumentFields(service, {
      tenantId: TENANT_ID,
      paymentId: PAYMENT_ID,
      providerPaymentRef: PAYMENT_REF,
      externalDocumentId: DOC_ID,
      externalDocumentNumber: '1001',
      documentUrl: PDF_URL,
      skipIfPresent: false,
    });

    expect(result).toEqual({ status: 'applied', pdfStored: true });
    expect(paymentUpdates[0]).toMatchObject({
      external_document_id: DOC_ID,
      external_document_number: '1001',
      invoice_url: PDF_URL,
      invoice_issued_at: expect.any(String),
      document_pdf_path: `documents/${TENANT_ID}/${PAYMENT_REF}/${DOC_ID}.pdf`,
      document_stored_at: expect.any(String),
    });
    expect(audits[0]).toMatchObject({
      tenant_id: TENANT_ID,
      action: PAYMENT_DOCUMENT_RECORDED,
      entity_type: 'payment',
      entity_id: PAYMENT_ID,
      after_state: expect.objectContaining({
        external_document_id: DOC_ID,
        pdf_stored: true,
      }),
    });
    expect(sendPaymentDocumentAdminEmail).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ tenantId: TENANT_ID, paymentId: PAYMENT_ID }),
    );
  });

  it('returns duplicate without rewriting when document already present', async () => {
    const { service, paymentUpdates, audits } = makeService({ existingDocId: DOC_ID });

    const result = await persistPaymentDocumentFields(service, {
      tenantId: TENANT_ID,
      paymentId: PAYMENT_ID,
      providerPaymentRef: PAYMENT_REF,
      externalDocumentId: 'DOC-2',
      documentUrl: PDF_URL,
      skipIfPresent: true,
    });

    expect(result.status).toBe('duplicate');
    expect(paymentUpdates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

describe('applyBundledDocumentNotify', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records document + audit for Grow/iCount/Invoice4U shared path', async () => {
    const { service, audits, queueUpdates } = makeService({ existingDocId: null });

    const result = await applyBundledDocumentNotify(service, {
      tenantId: TENANT_ID,
      providerPaymentRef: PAYMENT_REF,
      externalDocumentId: DOC_ID,
      externalDocumentNumber: '1001',
      documentUrl: PDF_URL,
    });

    expect(result).toMatchObject({ status: 'applied', paymentId: PAYMENT_ID, pdfStored: true });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe(PAYMENT_DOCUMENT_RECORDED);
    expect(queueUpdates[0]).toMatchObject({ status: 'succeeded' });
  });
});
