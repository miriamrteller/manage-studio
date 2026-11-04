/**
 * Takbull PR 5: documents for money recorded by hand (DocumentApi/Create), pairing, routing
 * and the client email wording. Fake database and fake Takbull only.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import {
  buildTakbullDocument,
  TakbullInvoicingProvider,
} from '../../../../supabase/functions/_shared/invoicing/providers/takbull';
import { getInvoicingProvider } from '../../../../supabase/functions/_shared/invoicing/index';
import { InvoicingProviderError, type CanonicalDocumentInput } from '../../../../supabase/functions/_shared/invoicing/types';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';
import { TakbullNotConnectedError } from '../../../../supabase/functions/_shared/payments/takbull/credentials';
import { documentRouteFor } from '../../../../supabase/functions/_shared/enqueue-document';
import { clientDocumentKind } from '../../../../supabase/functions/_shared/payments/send-payment-document-client-email';
import * as edgePairing from '../../../../supabase/functions/_shared/provider-pairing';
import * as webPairing from '../lib/providerPairing';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const PAYMENT = '00000000-0000-4000-8000-0000000000f1';

const base = {
  paymentId: PAYMENT, totalAmountMinor: 35050, currency: 'ils', language: 'he' as const,
  paidAt: '2026-11-04T09:00:00.000Z', customer: { name: 'Parent', email: 'parent@x.test' }, lineDescription: 'Ballet',
};

describe('the document request', () => {
  it('a cash receipt: the studio type, the payment in cash, no VAT, not emailed by Takbull', () => {
    const doc = buildTakbullDocument({ ...base, documentKind: 'sale', saleDocumentType: 400, paymentMethod: 'cash' });
    expect(doc).toMatchObject({
      documentType: 400, sendToCustomer: false, currency: 'ILS', language: 'he', isItemIncludeTax: true, totalPriceWithTax: 350.5,
      cashes: [{ amount: 350.5 }], customerVM: { customerFullName: 'Parent', email: 'parent@x.test' },
      invoiceItems: [{ description: 'Ballet', unitPrice: 350.5, quantity: 1, isTaxteble: false }],
    });
    expect(doc).not.toHaveProperty('isNegativeDocument');
  });

  it('a transfer or Bit on a tax invoice-receipt', () => {
    expect(buildTakbullDocument({ ...base, documentKind: 'sale', saleDocumentType: 320, paymentMethod: 'bank_transfer' }))
      .toMatchObject({ documentType: 320, wireTransfers: [{ amount: 350.5 }], invoiceItems: [{ isTaxteble: true }] });
    expect(buildTakbullDocument({ ...base, documentKind: 'sale', saleDocumentType: 320, paymentMethod: 'bit' }))
      .toMatchObject({ customPayments: [{ methodName: 'Bit', amount: 350.5, creationDate: base.paidAt, referanceId: PAYMENT }] });
  });

  it('a refund is a negative document: refund receipt (401) or credit tax invoice (330, no payment)', () => {
    const receipt = buildTakbullDocument({ ...base, totalAmountMinor: -10000, documentKind: 'refund', saleDocumentType: 400, paymentMethod: 'cash' });
    expect(receipt).toMatchObject({ documentType: 401, isNegativeDocument: true, cashes: [{ amount: 100 }], totalPriceWithTax: 100 });
    const credit = buildTakbullDocument({ ...base, totalAmountMinor: -10000, documentKind: 'refund', saleDocumentType: 320, paymentMethod: 'cash' });
    expect(credit).toMatchObject({ documentType: 330, isNegativeDocument: true });
    expect(credit).not.toHaveProperty('cashes');
  });
});

function input(over: Partial<CanonicalDocumentInput> = {}): CanonicalDocumentInput {
  return {
    tenantId: TENANT, paymentId: PAYMENT, documentKind: 'sale', language: 'he', currency: 'ILS',
    pretaxAmountMinor: 0, vatAmountMinor: 0, totalAmountMinor: 20000, vatRate: 0,
    payer: { name: 'Parent', email: 'parent@x.test' }, paymentMethod: 'cash', paidAt: '2026-11-04T09:00:00Z', description: null,
    ...over,
  };
}

describe('issueDocument', () => {
  it("issues on the studio's own account and returns Takbull's number, id and the kind", async () => {
    const { client } = makeFakeSupabase({ tenants: [{ id: TENANT, takbull_document_type: 400 }] });
    const api = new MockTakbullApi();
    const provider = new TakbullInvoicingProvider(async () => api);
    const result = await provider.issueDocument(client as never, input());
    expect(api.documents[0]).toMatchObject({ documentType: 400, cashes: [{ amount: 200 }], invoiceItems: [{ description: 'תשלום' }] });
    expect(result).toMatchObject({ externalDocumentNumber: '50001', documentUrl: '', documentKind: 'receipt' });
    expect(result.externalDocumentId).toBeTruthy();
  });

  it('card money is never documented here (Takbull issued it with the charge)', async () => {
    const { client } = makeFakeSupabase({ tenants: [{ id: TENANT, takbull_document_type: 320 }] });
    const api = new MockTakbullApi();
    await expect(new TakbullInvoicingProvider(async () => api).issueDocument(client as never, input({ paymentMethod: 'card' })))
      .rejects.toMatchObject({ retryable: false });
    expect(api.documents).toHaveLength(0);
  });

  it('no keys saved is a permanent failure; a Takbull refusal follows its own retry flag', async () => {
    const { client } = makeFakeSupabase({ tenants: [{ id: TENANT, takbull_document_type: 320 }] });
    const notConnected = new TakbullInvoicingProvider(async () => { throw new TakbullNotConnectedError(); });
    await expect(notConnected.issueDocument(client as never, input())).rejects.toBeInstanceOf(InvoicingProviderError);
    await expect(notConnected.issueDocument(client as never, input())).rejects.toMatchObject({ retryable: false });

    const api = new MockTakbullApi();
    const { TakbullApiError } = await import('../../../../supabase/functions/_shared/payments/takbull/client');
    api.createDocument = vi.fn(async () => { throw new TakbullApiError('Takbull down', { endpoint: 'x', retryable: true }); });
    await expect(new TakbullInvoicingProvider(async () => api).issueDocument(client as never, input()))
      .rejects.toMatchObject({ retryable: true });
  });

  it('is the invoicing provider for the takbull slug', () => {
    expect(getInvoicingProvider('takbull').slug).toBe('takbull');
  });
});

describe('routing, pairing and wording', () => {
  it("a Takbull card payment's document came with the charge; money recorded by hand is queued", () => {
    expect(documentRouteFor({ invoicingProvider: 'takbull', paymentProvider: 'takbull', documentKind: 'sale' })).toEqual({ route: 'skip_issued_with_charge' });
    expect(documentRouteFor({ invoicingProvider: 'takbull', paymentProvider: 'takbull', documentKind: 'refund' }).route).toBe('not_issued');
    expect(documentRouteFor({ invoicingProvider: 'takbull', paymentProvider: 'manual', documentKind: 'sale' })).toEqual({ route: 'queue' });
    expect(documentRouteFor({ invoicingProvider: 'takbull', paymentProvider: 'manual', documentKind: 'refund' })).toEqual({ route: 'queue' });
  });

  it('pairs with Takbull or pay at the studio, and is not offered yet (web and server agree)', () => {
    for (const pairing of [edgePairing, webPairing]) {
      expect(pairing.invoicingPairsWithPayment('takbull', 'takbull')).toBe(true);
      expect(pairing.invoicingPairsWithPayment('offline', 'takbull')).toBe(true);
      expect(pairing.invoicingPairsWithPayment('grow', 'takbull')).toBe(false);
      expect(pairing.invoicingOptionsFor('offline')).not.toContain('takbull');
    }
  });

  it("the client email names the studio's document type", () => {
    expect(clientDocumentKind({ invoicing_provider: 'takbull', takbull_document_type: 400 })).toBe('receipt');
    expect(clientDocumentKind({ invoicing_provider: 'takbull', takbull_document_type: 320 })).toBe('invoice_receipt');
  });
});
