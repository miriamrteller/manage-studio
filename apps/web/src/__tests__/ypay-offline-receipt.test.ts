/**
 * Thread H — receipts for cash / bank-transfer payments on YPay tenants.
 *
 * The YPay invoicing adapter issues a standalone document through POST /document,
 * the document queue persists it idempotently, and the client gets one email.
 * fetch, PDF retention and email transport are stubbed: no network, no credentials.
 *
 * Run: pnpm -C apps/web test ypay-offline-receipt.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';

const sendHtmlEmail = vi.fn(async () => ({ id: 'msg-1' }));
vi.mock('../../../../supabase/functions/_shared/email-client.ts', () => ({
  sendHtmlEmail: (...args: unknown[]) => sendHtmlEmail(...args),
}));
vi.mock('../../../../supabase/functions/_shared/payments/bundled-document-pdf.ts', () => ({
  fetchAndStoreBundledDocumentPdf: vi.fn(async () => ({ pdfPath: null })),
}));
vi.mock('../../../../supabase/functions/_shared/payments/send-payment-document-admin-email.ts', () => ({
  sendPaymentDocumentAdminEmail: vi.fn(async () => ({ sent: true })),
}));

import { YpayInvoicingProvider } from '../../../../supabase/functions/_shared/invoicing/providers/ypay.ts';
import { processQueueRow } from '../../../../supabase/functions/_shared/invoicing/process-queue-row.ts';
import { InvoicingProviderError, type CanonicalDocumentInput } from '../../../../supabase/functions/_shared/invoicing/types.ts';
import { buildCanonicalDocumentInput } from '../../../../supabase/functions/_shared/invoicing/build-canonical-input.ts';
import {
  paymentNeedsClientDocumentEmail,
  renderClientDocumentEmail,
} from '../../../../supabase/functions/_shared/payments/send-payment-document-client-email.ts';
import { ypayDocTypeForVatType } from '../../../../supabase/functions/_shared/payments/ypay/document.ts';
import { YpayPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/ypay.ts';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const PERSON = 'person-1';
const PAYMENT = 'pay-offline-1';
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

/** The slice of fetch's init the assertions read. */
type FetchInit = { headers: Record<string, string>; body: string };

function seed(opts: { vatType?: number; paymentMethod?: string; provider?: string; invoicingProvider?: string } = {}) {
  const fake = makeFakeSupabase({
    tenants: [
      {
        id: TENANT,
        name: 'Lumen & Light',
        subdomain: 'lumen',
        contact_email: 'studio@example.com',
        from_email: null,
        from_email_verified_at: null,
        language_default: 'he',
        vat_type: opts.vatType ?? 1,
        invoicing_provider: opts.invoicingProvider ?? 'ypay',
      },
    ],
    people: [{ id: PERSON, name: 'Dana Levi', email: 'dana@example.com' }],
    payments: [
      {
        id: PAYMENT,
        tenant_id: TENANT,
        person_id: PERSON,
        billing_account_id: null,
        engagement_id: 'eng-1',
        provider: opts.provider ?? 'manual',
        provider_payment_ref: `manual_jpr_req-1_1`,
        payment_method: opts.paymentMethod ?? 'bank_transfer',
        pretax_amount_minor: 0,
        vat_amount_minor: 0,
        total_amount_minor: 150000,
        currency: 'ILS',
        vat_rate: 0,
        status: 'succeeded',
        paid_at: '2026-10-30T09:00:00Z',
        description: 'מקדמה — manual bank_transfer',
        refunds_payment_id: null,
        external_document_id: null,
        external_document_number: null,
        invoice_url: null,
      },
    ],
    payment_provider_token_cache: [
      { tenant_id: TENANT, provider: 'ypay', token: 'cached-token', expires_at: FUTURE },
    ],
    document_queue: [],
    audit_log: [],
  });
  // get_tenant_payment_credentials → client id / secret.
  fake.client.rpc = (async () => ({
    data: [{ payment_provider_public_key: 'client-id', payment_provider_secret_key: 'client-secret' }],
    error: null,
  })) as never;
  return fake;
}

function ypayResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

async function canonical(client: unknown): Promise<CanonicalDocumentInput> {
  return buildCanonicalDocumentInput(client as never, { paymentId: PAYMENT, documentKind: 'sale' });
}

beforeEach(() => {
  process.env.PLATFORM_EMAIL_DOMAIN = 'opalswift.test';
  delete process.env.YPAY_MOCK;
  sendHtmlEmail.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.YPAY_MOCK;
});

describe('ypay docType by VAT type', () => {
  it('VAT-exempt dealers get a receipt, everyone else an invoice-receipt', () => {
    expect(ypayDocTypeForVatType(3)).toBe(108);
    expect(ypayDocTypeForVatType(1)).toBe(109);
    expect(ypayDocTypeForVatType(2)).toBe(109);
    expect(ypayDocTypeForVatType(null)).toBe(109);
  });
});

describe('YpayInvoicingProvider.issueDocument — live /document call', () => {
  it('posts a bank-transfer invoice-receipt with the cached bearer token and returns the document', async () => {
    const { client } = seed({ vatType: 1 });
    // Response shape from the YPay API document v2.1 ("Document Generator").
    const fetchMock = vi.fn(async () =>
      ypayResponse({ responseCode: 1, serial_number: '900061', url: 'https://ypay.co.il/fsrv/business/1658/customers/44/official/12ca76.pdf' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new YpayInvoicingProvider().issueDocument(client as never, await canonical(client));

    expect(result).toEqual({
      externalDocumentId: '900061',
      externalDocumentNumber: '900061',
      documentUrl: 'https://ypay.co.il/fsrv/business/1658/customers/44/official/12ca76.pdf',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, FetchInit];
    expect(url).toBe('https://ypay.co.il/api/v1/document');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer cached-token');
    const body = JSON.parse(String(init.body));
    expect(body.docType).toBe(109);
    expect(body.contact).toEqual({ email: 'dana@example.com', name: 'Dana Levi' });
    expect(body.items[0]).toMatchObject({ price: 1500, quantity: 1, vatIncluded: true });
    // v2.1 Payment Methods: 2 = bank transfer; Method = { type, total, date }.
    expect(body.methods).toEqual([{ type: 2, total: 1500, date: '2026-10-30' }]);
    expect(body.details).toContain(PAYMENT);
    expect(body.mail).toBe(false);
    expect(body.rounding).toBe(false);
    expect(body).not.toHaveProperty('chargeIdentifier');
  });

  it('issues a plain receipt (108) for a VAT-exempt tenant paying cash', async () => {
    const { client } = seed({ vatType: 3, paymentMethod: 'cash' });
    const fetchMock = vi.fn(async () => ypayResponse({ responseCode: 1, serial_number: 9, url: 'https://docs.ypay.test/9.pdf' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new YpayInvoicingProvider().issueDocument(client as never, await canonical(client));

    expect(result.externalDocumentId).toBe('9');
    expect(result.externalDocumentNumber).toBe('9');
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, FetchInit])[1].body));
    expect(body.docType).toBe(108);
    // v2.1 Payment Methods: 1 = cash.
    expect(body.methods[0].type).toBe(1);
    expect(body.methods[0].total).toBe(body.items[0].price);
  });

  it('maps a rejected payment-method payload (3011) to a non-retryable error', async () => {
    const { client } = seed();
    vi.stubGlobal('fetch', vi.fn(async () => ypayResponse({ responseCode: 3011 })));

    const err = await new YpayInvoicingProvider()
      .issueDocument(client as never, await canonical(client))
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvoicingProviderError);
    expect((err as InvoicingProviderError).retryable).toBe(false);
    expect((err as Error).message).toMatch(/payment methods/i);
  });

  it('marks a YPay outage (HTTP 503) retryable', async () => {
    const { client } = seed();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream down', { status: 503 })));

    const err = await new YpayInvoicingProvider()
      .issueDocument(client as never, await canonical(client))
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvoicingProviderError);
    expect((err as InvoicingProviderError).retryable).toBe(true);
  });

  it('expires the cached token and retries when YPay says the token expired (1004)', async () => {
    const { db, client } = seed();
    vi.stubGlobal('fetch', vi.fn(async () => ypayResponse({ responseCode: 1004 })));

    const err = await new YpayInvoicingProvider()
      .issueDocument(client as never, await canonical(client))
      .catch((e: unknown) => e);

    expect((err as InvoicingProviderError).retryable).toBe(true);
    const cache = db.tables.payment_provider_token_cache[0];
    expect(new Date(cache.expires_at as string).getTime()).toBeLessThan(Date.now());
  });

  it('refuses card payments and refunds without calling YPay', async () => {
    const { client } = seed({ paymentMethod: 'card', provider: 'ypay' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new YpayInvoicingProvider();

    const cardErr = await provider.issueDocument(client as never, await canonical(client)).catch((e: unknown) => e);
    expect((cardErr as InvoicingProviderError).retryable).toBe(false);

    const refundInput = { ...(await canonical(client)), documentKind: 'refund' as const, paymentMethod: 'bank_transfer' as const };
    const refundErr = await provider.issueDocument(client as never, refundInput).catch((e: unknown) => e);
    expect((refundErr as InvoicingProviderError).retryable).toBe(false);
    expect((refundErr as Error).message).toMatch(/credit-note/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails permanently when the payer has no email (YPay requires one)', async () => {
    const { db, client } = seed();
    db.tables.people[0].email = null;
    vi.stubGlobal('fetch', vi.fn());

    const err = await new YpayInvoicingProvider()
      .issueDocument(client as never, await canonical(client))
      .catch((e: unknown) => e);

    expect((err as InvoicingProviderError).retryable).toBe(false);
    expect((err as Error).message).toMatch(/email/i);
  });

  it('YPAY_MOCK returns a deterministic document without any network call', async () => {
    process.env.YPAY_MOCK = 'true';
    const { client } = seed({ vatType: 3, paymentMethod: 'cash' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new YpayInvoicingProvider().issueDocument(client as never, await canonical(client));

    expect(result.externalDocumentId).toBe(`mock-ypay-doc-${PAYMENT}`);
    expect(result.externalDocumentNumber).toMatch(/^YPAY-MOCK-108-/);
    expect(result.documentUrl).toContain('mock.ypay.local');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('document queue — offline receipt end to end', () => {
  function queueRow(db: ReturnType<typeof seed>['db'], id = 'q-1') {
    const row = { id, tenant_id: TENANT, payment_id: PAYMENT, document_kind: 'sale', attempts: 0, status: 'pending', scheduled_for: new Date(0).toISOString() };
    db.tables.document_queue.push({ ...row });
    return row as never;
  }

  it('issues once, stores id / number / URL on the payment, emails the client once', async () => {
    process.env.YPAY_MOCK = 'true';
    const { db, client } = seed();

    const outcome = await processQueueRow(client as never, queueRow(db));

    expect(outcome).toBe('succeeded');
    const payment = db.tables.payments[0];
    expect(payment.external_document_id).toBe(`mock-ypay-doc-${PAYMENT}`);
    expect(payment.external_document_number).toMatch(/^YPAY-MOCK-109-/);
    expect(payment.invoice_url).toContain('mock.ypay.local');
    expect(payment.invoice_issued_at).toBeTruthy();
    expect(db.tables.document_queue[0].status).toBe('succeeded');

    const actions = db.tables.audit_log.map((a) => a.action);
    expect(actions.filter((a) => a === 'payment_document_recorded')).toHaveLength(1);
    expect(actions.filter((a) => a === 'payment_document_client_email_sent')).toHaveLength(1);
    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
    const mail = (sendHtmlEmail.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }])[0];
    expect(mail.to).toBe('dana@example.com');
    expect(mail.subject).toContain('חשבונית מס קבלה');
    expect(mail.html).toContain('mock.ypay.local');

    // Replayed / duplicate queue row for the same payment: no second document, no second email.
    const replay = await processQueueRow(client as never, queueRow(db, 'q-2'));
    expect(replay).toBe('succeeded');
    expect(db.tables.audit_log.filter((a) => a.action === 'payment_document_recorded')).toHaveLength(1);
    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
    expect(db.tables.document_queue.every((q) => q.status === 'succeeded')).toBe(true);
  });

  it('never calls the provider when the payment already carries a document', async () => {
    const { db, client } = seed();
    db.tables.payments[0].external_document_id = 'DOC-EXISTING';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processQueueRow(client as never, queueRow(db));

    expect(outcome).toBe('succeeded');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.tables.payments[0].external_document_id).toBe('DOC-EXISTING');
  });

  it('a transient YPay failure schedules a retry; a rejected payload goes dead with an admin alert', async () => {
    const { db, client } = seed();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));

    const first = await processQueueRow(client as never, queueRow(db));
    expect(first).toBe('retry');
    const row = db.tables.document_queue[0];
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(new Date(row.scheduled_for as string).getTime()).toBeGreaterThan(Date.now());
    expect(String(row.last_error)).toMatch(/503/);
    expect(db.tables.payments[0].external_document_id).toBeNull();
    expect(sendHtmlEmail).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn(async () => ypayResponse({ responseCode: 3022 })));
    const second = await processQueueRow(client as never, { ...(row as object), attempts: 1 } as never);
    expect(second).toBe('dead');
    expect(row.status).toBe('dead');
    expect(db.tables.audit_log.some((a) => a.action === 'document_queue_dead_alert')).toBe(true);
  });

  it('card payments documented by YPay itself do not get the app email', async () => {
    process.env.YPAY_MOCK = 'true';
    const { db, client } = seed({ provider: 'ypay', paymentMethod: 'card' });
    db.tables.payments[0].external_document_id = 'DOC-FROM-CALLBACK';

    await processQueueRow(client as never, queueRow(db));

    expect(sendHtmlEmail).not.toHaveBeenCalled();
    expect(paymentNeedsClientDocumentEmail({ provider: 'ypay', payment_method: 'card' })).toBe(false);
    expect(paymentNeedsClientDocumentEmail({ provider: 'manual', payment_method: 'cash' })).toBe(true);
  });
});

describe('client receipt email wording', () => {
  it('names the document by the tenant VAT status in both languages', () => {
    const he = renderClientDocumentEmail({
      language: 'he', studioName: 'סטודיו', recipientName: 'דנה', amount: '₪1,500', docNumber: '42',
      docUrl: 'https://docs.ypay.test/42.pdf', paymentMethod: 'cash', vatExempt: true,
    });
    expect(he.subject).toBe('סטודיו: קבלה 42');
    expect(he.html).toContain('dir="rtl"');
    expect(he.html).toContain('במזומן');
    expect(he.html).toContain('https://docs.ypay.test/42.pdf');

    const en = renderClientDocumentEmail({
      language: 'en', studioName: 'Studio <x>', recipientName: '', amount: '₪1,500', docNumber: '42',
      docUrl: '', paymentMethod: 'bank_transfer', vatExempt: false,
    });
    expect(en.subject).toBe('Studio <x>: Invoice-receipt 42');
    expect(en.html).toContain('Studio &lt;x&gt;');
    expect(en.html).toContain('by bank transfer');
    expect(en.html).toContain('client portal');
  });
});

describe('YpayPaymentProvider.createCharge — card path docType follows VAT status too', () => {
  function cardSeed(vatType: number) {
    const fake = makeFakeSupabase({
      tenants: [{ id: TENANT, vat_type: vatType }],
      engagements: [{ id: 'eng-1', person_id: PERSON, offering_id: 'off-1', billing_account_id: 'ba-1' }],
      billing_accounts: [{ id: 'ba-1', person_id: PERSON, account_id: null, business_name: null, business_tax_id: null }],
      people: [{ id: PERSON, name: 'Dana Levi', email: 'dana@example.com', account_id: null, emergency_contact_phone: null }],
      payments: [],
      audit_log: [],
      payment_provider_token_cache: [{ tenant_id: TENANT, provider: 'ypay', token: 'cached-token', expires_at: FUTURE }],
    });
    fake.client.rpc = (async () => ({
      data: [{ payment_provider_public_key: 'client-id', payment_provider_secret_key: 'client-secret' }],
      error: null,
    })) as never;
    return fake;
  }

  async function chargeDocType(vatType: number): Promise<number> {
    (globalThis as unknown as { Deno?: unknown }).Deno = {
      env: { get: (k: string) => ({ YPAY_NOTIFY_URL: 'https://edge.test/handle-payment-event', APP_URL: 'https://app.test' })[k] },
    };
    try {
      const { client } = cardSeed(vatType);
      const fetchMock = vi.fn(async () => ypayResponse({ responseCode: 1, url: 'https://pay.ypay.test/x' }));
      vi.stubGlobal('fetch', fetchMock);
      const result = await new YpayPaymentProvider(client as never).createCharge({
        amountMinor: 50000,
        currency: 'ILS',
        metadata: { tenant_id: TENANT, engagement_id: 'eng-1', billing_account_id: 'ba-1', charge_type: 'initial' },
      } as never);
      expect(result.pageUrl).toBe('https://pay.ypay.test/x');
      const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, FetchInit])[1].body));
      return body.docType as number;
    } finally {
      delete (globalThis as unknown as { Deno?: unknown }).Deno;
    }
  }

  it('VAT-registered tenant: invoice-receipt (109) as before', async () => {
    expect(await chargeDocType(1)).toBe(109);
  });

  it('VAT-exempt tenant: receipt (108) instead of a tax invoice it may not issue', async () => {
    expect(await chargeDocType(3)).toBe(108);
  });
});
