/**
 * Grow webhook pre-shared key validation (GAP 4) on the document paths.
 * Opt-in per tenant: no stored key → accepted; stored key → the notify must
 * carry a matching `webhookKey`, and omission is rejected, not skipped.
 * Run: pnpm -C apps/web test grow-webhook-key.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../supabase/functions/_shared/payments/send-payment-document-admin-email.ts', () => ({
  sendPaymentDocumentAdminEmail: vi.fn(async () => ({ sent: true })),
  PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT: 'payment_document_admin_email_sent',
  PAYMENT_DOCUMENT_ADMIN_EMAIL_FAILED: 'payment_document_admin_email_failed',
  PAYMENT_DOCUMENT_ADMIN_EMAIL_SKIPPED: 'payment_document_admin_email_skipped',
}));

import {
  GrowWebhookKeyError,
  verifyGrowWebhookKey,
} from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import { handlePaymentDocumentInternal } from '../../../../supabase/functions/_shared/payments/handle-payment-document.ts';
import { handleInvoiceEventInternal } from '../../../../supabase/functions/_shared/payments/handle-invoice-event.ts';
import growInvoiceNotify from './fixtures/grow-invoice-notify.json';

const TENANT_ID = '00000000-0000-0000-0000-0000000000aa';
const STORED_KEY = 'grow-mock-webhook-key-dev-00000001';

function serviceWithKey(storedKey: string | null) {
  return {
    rpc: async () => ({
      data: storedKey ? [{ webhook_secret: storedKey }] : [],
      error: null,
    }),
  } as never;
}

describe('verifyGrowWebhookKey', () => {
  it('accepts when no key is stored for the tenant (opt-in validation)', async () => {
    await expect(
      verifyGrowWebhookKey(serviceWithKey(null), TENANT_ID, {
        data: { cField1: TENANT_ID },
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts when the inbound key matches the stored key', async () => {
    await expect(
      verifyGrowWebhookKey(serviceWithKey(STORED_KEY), TENANT_ID, {
        data: { cField1: TENANT_ID, webhookKey: STORED_KEY },
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects when the inbound key mismatches the stored key', async () => {
    await expect(
      verifyGrowWebhookKey(serviceWithKey(STORED_KEY), TENANT_ID, {
        data: { cField1: TENANT_ID, webhookKey: 'wrong-key' },
      }),
    ).rejects.toBeInstanceOf(GrowWebhookKeyError);
  });

  it('rejects when a key is stored but the notify omits webhookKey', async () => {
    await expect(
      verifyGrowWebhookKey(serviceWithKey(STORED_KEY), TENANT_ID, {
        data: { cField1: TENANT_ID },
      }),
    ).rejects.toBeInstanceOf(GrowWebhookKeyError);
  });
});

describe('handlePaymentDocumentInternal key enforcement', () => {
  it('returns 401 without applying when the key mismatches', async () => {
    const body = {
      ...growInvoiceNotify,
      data: {
        ...(growInvoiceNotify as { data: Record<string, unknown> }).data,
        webhookKey: 'wrong-key',
      },
    };

    const result = await handlePaymentDocumentInternal(
      serviceWithKey(STORED_KEY),
      body as Record<string, unknown>,
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: expect.stringContaining('webhook key mismatch'),
    });
  });
});

describe('handleInvoiceEventInternal key enforcement (Grow branch)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeService(storedKey: string | null) {
    const paymentUpdates: Record<string, unknown>[] = [];
    const service = {
      from(table: string) {
        if (table === 'tenants') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { invoicing_provider: 'grow' },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        return {
          insert: async () => ({ error: null }),
          update: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }),
        };
      },
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      rpc: async () => ({
        data: storedKey ? [{ webhook_secret: storedKey }] : [],
        error: null,
      }),
    } as never;
    return { service, paymentUpdates };
  }

  it('returns 401 without writing when a key is stored and the notify omits it', async () => {
    const { service, paymentUpdates } = makeService(STORED_KEY);

    const result = await handleInvoiceEventInternal(
      service,
      JSON.stringify(growInvoiceNotify),
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: expect.stringContaining('webhook key mismatch'),
    });
    expect(paymentUpdates).toHaveLength(0);
  });

  it('applies the document when the inbound key matches', async () => {
    const { service, paymentUpdates } = makeService(STORED_KEY);
    const body = {
      ...growInvoiceNotify,
      data: {
        ...(growInvoiceNotify as { data: Record<string, unknown> }).data,
        webhookKey: STORED_KEY,
      },
    };

    const result = await handleInvoiceEventInternal(service, JSON.stringify(body));

    expect(result.ok).toBe(true);
    expect(paymentUpdates[0]).toMatchObject({ external_document_id: 'DOC-555000' });
  });
});
