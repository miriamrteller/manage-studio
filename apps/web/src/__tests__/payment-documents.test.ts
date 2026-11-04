/**
 * Accountant view, PR1: each payment's tax document (type + number + link) or a clear
 * "no document" reason, and the VAT split taken from the document issued (never from
 * business status).
 * Run: pnpm -C apps/web test payment-documents.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  israelVatRateOn,
  paymentDocumentStatus,
  vatSplitFromDocument,
} from '@/features/finance-admin/lib/paymentDocuments';
import {
  documentKindFromGreenInvoiceType,
  documentKindFromYpayDocType,
} from '../../../../supabase/functions/_shared/payments/document-kind.ts';

const paid = {
  status: 'succeeded' as const,
  charge_type: 'initial' as const,
  provider: 'manual',
  external_document_id: null,
  external_document_number: null,
  invoice_url: null,
  issued_document_kind: null,
  document_queue: [],
};

describe('paymentDocumentStatus', () => {
  it('shows the issued document with its type, number and link', () => {
    expect(
      paymentDocumentStatus(
        {
          ...paid,
          external_document_id: 'd1',
          external_document_number: '1001',
          invoice_url: 'https://x/doc',
          issued_document_kind: 'receipt',
        },
        { invoicing_provider: 'ypay' },
      ),
    ).toEqual({ issued: true, kind: 'receipt', number: '1001', url: 'https://x/doc' });
  });

  it('keeps the type unknown when the provider did not say (Grow and others)', () => {
    const s = paymentDocumentStatus(
      { ...paid, provider: 'grow', external_document_id: 'g1', external_document_number: '55' },
      { invoicing_provider: 'grow' },
    );
    expect(s).toEqual({ issued: true, kind: null, number: '55', url: null });
  });

  it('unpaid rows need no document', () => {
    expect(paymentDocumentStatus({ ...paid, status: 'pending' }, { invoicing_provider: 'ypay' })).toEqual({
      issued: false,
      reason: 'not_paid',
    });
  });

  it('uses the latest queue attempt', () => {
    const s = paymentDocumentStatus(
      {
        ...paid,
        document_queue: [
          { status: 'dead', document_kind: 'sale', created_at: '2026-01-01T00:00:00Z' },
          { status: 'pending', document_kind: 'sale', created_at: '2026-01-02T00:00:00Z' },
        ],
      },
      { invoicing_provider: 'green_invoice' },
    );
    expect(s).toEqual({ issued: false, reason: 'pending' });
    expect(
      paymentDocumentStatus(
        { ...paid, document_queue: [{ status: 'dead', document_kind: 'sale', created_at: '2026-01-01T00:00:00Z' }] },
        { invoicing_provider: 'green_invoice' },
      ),
    ).toEqual({ issued: false, reason: 'failed' });
    expect(
      paymentDocumentStatus(
        { ...paid, document_queue: [{ status: 'not_issued', document_kind: 'sale', created_at: '2026-01-01T00:00:00Z' }] },
        { invoicing_provider: 'grow' },
      ),
    ).toEqual({ issued: false, reason: 'not_issued' });
  });

  it('studios without invoicing, YPay refunds, and anything else', () => {
    expect(paymentDocumentStatus(paid, { invoicing_provider: 'none' })).toEqual({ issued: false, reason: 'no_invoicing' });
    expect(
      paymentDocumentStatus({ ...paid, charge_type: 'refund', provider: 'ypay' }, { invoicing_provider: 'ypay' }),
    ).toEqual({ issued: false, reason: 'refund_in_provider' });
    expect(paymentDocumentStatus(paid, { invoicing_provider: 'ypay' })).toEqual({ issued: false, reason: 'missing' });
  });
});

describe('vatSplitFromDocument', () => {
  it('tax invoice-receipt: VAT included at 18% from 2025', () => {
    expect(vatSplitFromDocument(11800, 'tax_invoice_receipt', '2026-03-01T10:00:00Z')).toEqual({
      pretaxMinor: 10000,
      vatMinor: 1800,
      totalMinor: 11800,
      vatRate: 0.18,
    });
  });

  it('17% before 2025', () => {
    expect(israelVatRateOn('2024-12-31')).toBe(0.17);
    expect(israelVatRateOn('2025-01-01')).toBe(0.18);
    expect(vatSplitFromDocument(11700, 'tax_invoice_receipt', '2024-06-01')).toMatchObject({
      pretaxMinor: 10000,
      vatMinor: 1700,
    });
  });

  it('receipt: no VAT', () => {
    expect(vatSplitFromDocument(5000, 'receipt', '2026-01-01')).toEqual({
      pretaxMinor: 5000,
      vatMinor: 0,
      totalMinor: 5000,
      vatRate: 0,
    });
  });

  it('credit note: negative split; unknown: gross only', () => {
    expect(vatSplitFromDocument(-11800, 'credit_note', '2026-01-01')).toMatchObject({
      pretaxMinor: -10000,
      vatMinor: -1800,
    });
    expect(vatSplitFromDocument(5000, null, '2026-01-01')).toEqual({
      pretaxMinor: null,
      vatMinor: null,
      totalMinor: 5000,
      vatRate: null,
    });
  });

  it('a mid-year status change follows each payment\'s own document', () => {
    const before = vatSplitFromDocument(10000, 'receipt', '2026-03-01');
    const after = vatSplitFromDocument(11800, 'tax_invoice_receipt', '2026-09-01');
    expect(before.vatMinor).toBe(0);
    expect(after.vatMinor).toBe(1800);
  });
});

describe('provider document codes', () => {
  it('YPay 108/109', () => {
    expect(documentKindFromYpayDocType(108)).toBe('receipt');
    expect(documentKindFromYpayDocType('109')).toBe('tax_invoice_receipt');
    expect(documentKindFromYpayDocType(undefined)).toBeNull();
  });
  it('Green Invoice 320/400/330', () => {
    expect(documentKindFromGreenInvoiceType(320)).toBe('tax_invoice_receipt');
    expect(documentKindFromGreenInvoiceType(400)).toBe('receipt');
    expect(documentKindFromGreenInvoiceType(330)).toBe('credit_note');
    expect(documentKindFromGreenInvoiceType(1)).toBeNull();
  });
});
