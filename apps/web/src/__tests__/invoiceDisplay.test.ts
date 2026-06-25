/**
 * invoiceDisplay — unit tests (Gap 2 post-cleanup)
 *
 * allocationNumber and isPendingAllocation are removed from this module.
 * These tests are the canonical replacement for the deleted provider-adapter.test.ts.
 *
 * Run: pnpm test invoiceDisplay.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  buildInvoiceDisplayLines,
  getSettlementStatusLabel,
  type GrowSettledCharge,
} from '../features/finance/lib/invoiceDisplay';

const BASE: GrowSettledCharge = {
  externalDocumentNumber: 'INV-2024-001',
  documentUrl: 'https://cdn.example.com/doc.pdf',
  amountMinor: 11_700,
  status: 'succeeded',
};

describe('buildInvoiceDisplayLines', () => {
  it('includes amount line with correct ILS formatting', () => {
    const lines = buildInvoiceDisplayLines(BASE);
    expect(lines.some(l => l.includes('117.00'))).toBe(true);
  });

  it('includes document number when present', () => {
    const lines = buildInvoiceDisplayLines(BASE);
    expect(lines.some(l => l.includes('INV-2024-001'))).toBe(true);
  });

  it('omits document number line when externalDocumentNumber is null', () => {
    const lines = buildInvoiceDisplayLines({ ...BASE, externalDocumentNumber: null });
    expect(lines.filter(l => l.includes('חשבונית')).length).toBe(0);
  });

  it('includes URL line when documentUrl is present', () => {
    const lines = buildInvoiceDisplayLines(BASE);
    expect(lines.some(l => l.includes('cdn.example.com'))).toBe(true);
  });

  it('omits URL line when documentUrl is null', () => {
    const lines = buildInvoiceDisplayLines({ ...BASE, documentUrl: null });
    expect(lines.filter(l => l.includes('קישור')).length).toBe(0);
  });

  it('never renders the string "null" on any line', () => {
    const lines = buildInvoiceDisplayLines({
      ...BASE,
      externalDocumentNumber: null,
      documentUrl: null,
    });
    lines.forEach(l => expect(l).not.toContain('null'));
  });

  it('returns at least one line (amount) even with all optional fields null', () => {
    const lines = buildInvoiceDisplayLines({
      ...BASE,
      externalDocumentNumber: null,
      documentUrl: null,
    });
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getSettlementStatusLabel', () => {
  it('returns שולם for succeeded', () => {
    expect(getSettlementStatusLabel({ status: 'succeeded' })).toBe('שולם');
  });

  it('returns נכשל for failed', () => {
    expect(getSettlementStatusLabel({ status: 'failed' })).toBe('נכשל');
  });
});
