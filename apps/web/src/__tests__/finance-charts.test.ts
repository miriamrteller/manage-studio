/**
 * Accountant view, PR4: monthly revenue, by method, and the VAT-period summary, all from
 * the documents issued (never from business status).
 * Run: pnpm -C apps/web test finance-charts.test.ts
 */
import { describe, it, expect } from 'vitest';
import type { PaymentLogRow } from '@shared/schemas';
import {
  jerusalemMonth,
  lastMonths,
  revenueByMethod,
  revenueByMonth,
  summariseVatPeriod,
} from '@/features/finance-admin/lib/financeCharts';

let n = 0;
function row(over: Partial<PaymentLogRow>): PaymentLogRow {
  n += 1;
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    pretax_amount_minor: 0,
    vat_amount_minor: 0,
    total_amount_minor: 11800,
    currency: 'ILS',
    status: 'succeeded',
    charge_type: 'initial',
    provider: 'ypay',
    payment_method: 'card',
    paid_at: '2026-09-10T08:00:00Z',
    created_at: '2026-09-10T08:00:00Z',
    external_document_id: 'd',
    external_document_number: '1',
    invoice_url: null,
    issued_document_kind: 'tax_invoice_receipt',
    document_queue: [],
    ...over,
  } as PaymentLogRow;
}

describe('months', () => {
  it('Israel time decides the month', () => {
    expect(jerusalemMonth('2026-10-31T22:30:00Z')).toBe('2026-11');
  });
  it('last 12 months, oldest first, across the year', () => {
    const months = lastMonths(12, new Date('2026-02-10T10:00:00Z'));
    expect(months[0]).toBe('2025-03');
    expect(months[11]).toBe('2026-02');
    expect(months).toHaveLength(12);
  });
});

describe('revenueByMonth / revenueByMethod', () => {
  it('refunds come off their own month', () => {
    const rows = [
      row({ total_amount_minor: 10000, paid_at: '2026-09-02T10:00:00Z' }),
      row({ total_amount_minor: -3000, charge_type: 'refund', paid_at: '2026-10-02T10:00:00Z' }),
      row({ total_amount_minor: 5000, paid_at: '2025-01-02T10:00:00Z' }), // outside the window
    ];
    const out = revenueByMonth(rows, ['2026-09', '2026-10']);
    expect(out).toEqual([
      { month: '2026-09', paidMinor: 10000, refundsMinor: 0, netMinor: 10000 },
      { month: '2026-10', paidMinor: 0, refundsMinor: -3000, netMinor: -3000 },
    ]);
  });

  it('by method, largest first', () => {
    const out = revenueByMethod([
      row({ payment_method: 'cash', total_amount_minor: 2000 }),
      row({ payment_method: 'card', total_amount_minor: 9000 }),
      row({ payment_method: 'cash', total_amount_minor: 1000 }),
      row({ payment_method: null, total_amount_minor: 500 }),
    ]);
    expect(out.map((m) => [m.method, m.totalMinor, m.count])).toEqual([
      ['card', 9000, 1],
      ['cash', 3000, 2],
      ['other', 500, 1],
    ]);
  });
});

describe('summariseVatPeriod', () => {
  it('splits VAT only on tax invoice-receipts and credits; receipts carry none', () => {
    const s = summariseVatPeriod(
      [
        row({ total_amount_minor: 11800, issued_document_kind: 'tax_invoice_receipt' }),
        row({ total_amount_minor: -11800, charge_type: 'refund', issued_document_kind: 'credit_note' }),
        row({ total_amount_minor: 23600, issued_document_kind: 'tax_invoice_receipt' }),
        row({ total_amount_minor: 5000, issued_document_kind: 'receipt' }),
        row({ provider: 'grow', total_amount_minor: 7000, issued_document_kind: null }),
        row({
          provider: 'manual',
          total_amount_minor: 4000,
          external_document_id: null,
          external_document_number: null,
          issued_document_kind: null,
        }),
      ],
      { invoicing_provider: 'ypay' },
    );
    expect(s).toEqual({
      grossMinor: 11800 - 11800 + 23600 + 5000 + 7000 + 4000,
      vatDocumentsGrossMinor: 23600,
      pretaxMinor: 20000,
      vatMinor: 3600,
      receiptsMinor: 5000,
      unknownTypeMinor: 7000,
      refundsMinor: -11800,
      withoutDocumentMinor: 4000,
      withoutDocumentCount: 1,
    });
  });
});
