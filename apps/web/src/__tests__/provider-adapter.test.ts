/**
 * CNB-001 — Provider Adapter: allocationNumber nullable schema + null-guards
 *
 * Verifies:
 *   1. ProviderVatResponseSchema accepts null allocationNumber (legally valid)
 *   2. Empty string allocationNumber is rejected (must be min(1) or null)
 *   3. buildInvoiceDisplayLines does not throw and omits the field when null
 *   4. getAllocationNumber is null-safe
 *
 * Run: pnpm test provider-adapter.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  ProviderVatResponseSchema,
  ProviderValidationError,
} from '@shared/vat/provider-adapter';
import {
  buildInvoiceDisplayLines,
  getAllocationNumber,
  isPendingAllocation,
} from '../features/finance/lib/invoiceDisplay';

// ── Test fixture ──────────────────────────────────────────────────────────────

const BASE_RESPONSE = {
  pretax: 10_000,
  vat: 1_700,
  total: 11_700,
  vatRateApplied: 0.17,
  serialNumber: 'S-001',
  providerChargeId: 'ch_abc123',
  issuedAt: new Date().toISOString(),
  status: 'settled' as const,
};

// ── Schema: allocationNumber nullable ─────────────────────────────────────────

describe('ProviderVatResponseSchema — allocationNumber', () => {
  it('accepts a well-formed allocationNumber string', () => {
    const data = { ...BASE_RESPONSE, allocationNumber: 'HK-2024-001' };
    expect(() => ProviderVatResponseSchema.parse(data)).not.toThrow();
    expect(ProviderVatResponseSchema.parse(data).allocationNumber).toBe('HK-2024-001');
  });

  /**
   * CNB-001 core fix: null MUST be accepted.
   * Null = provider confirmed no allocation number required
   * (sub-₪25k threshold, B2C, or osek-patur).
   */
  it('CNB-001: accepts null allocationNumber — legally valid, must NOT throw', () => {
    const data = { ...BASE_RESPONSE, allocationNumber: null };
    expect(() => ProviderVatResponseSchema.parse(data)).not.toThrow();
    expect(ProviderVatResponseSchema.parse(data).allocationNumber).toBeNull();
  });

  it('rejects empty string allocationNumber — must be min(1) or null', () => {
    const data = { ...BASE_RESPONSE, allocationNumber: '' };
    expect(() => ProviderVatResponseSchema.parse(data)).toThrow();
  });

  it('rejects missing allocationNumber field — must be explicitly null, not omitted', () => {
    const data = { ...BASE_RESPONSE }; // no allocationNumber key
    expect(() => ProviderVatResponseSchema.parse(data)).toThrow();
  });

  it('accepts osek-patur invoice: vat=0, null allocationNumber — must NOT throw', () => {
    const data = {
      ...BASE_RESPONSE,
      pretax: 10_000,
      vat: 0,
      total: 10_000,
      vatRateApplied: 0,
      allocationNumber: null,
    };
    expect(() => ProviderVatResponseSchema.parse(data)).not.toThrow();
    const result = ProviderVatResponseSchema.parse(data);
    expect(result.vat).toBe(0);
    expect(result.allocationNumber).toBeNull();
  });

  it('accepts pending_allocation status with null allocationNumber', () => {
    const data = {
      ...BASE_RESPONSE,
      allocationNumber: null,
      status: 'pending_allocation' as const,
    };
    expect(() => ProviderVatResponseSchema.parse(data)).not.toThrow();
    const result = ProviderVatResponseSchema.parse(data);
    expect(result.status).toBe('pending_allocation');
    expect(result.allocationNumber).toBeNull();
  });
});

// ── null-guard: buildInvoiceDisplayLines ──────────────────────────────────────

describe('buildInvoiceDisplayLines — null-guard (CNB-001)', () => {
  it('does NOT throw when allocationNumber is null', () => {
    const charge = ProviderVatResponseSchema.parse({
      ...BASE_RESPONSE,
      allocationNumber: null,
    });
    expect(() => buildInvoiceDisplayLines(charge)).not.toThrow();
  });

  it('omits מספר הקצאה line when allocationNumber is null', () => {
    const charge = ProviderVatResponseSchema.parse({
      ...BASE_RESPONSE,
      allocationNumber: null,
    });
    const lines = buildInvoiceDisplayLines(charge);
    // Must NOT print the string "null" on the document face
    expect(lines.join('\n')).not.toContain('null');
    expect(lines.some((l) => l.includes('מספר הקצאה'))).toBe(false);
  });

  it('still renders serial number when allocationNumber is null', () => {
    const charge = ProviderVatResponseSchema.parse({
      ...BASE_RESPONSE,
      allocationNumber: null,
    });
    const lines = buildInvoiceDisplayLines(charge);
    expect(lines.some((l) => l.includes('חשבונית מס: S-001'))).toBe(true);
  });

  it('renders מספר הקצאה line when allocationNumber is present', () => {
    const charge = ProviderVatResponseSchema.parse({
      ...BASE_RESPONSE,
      allocationNumber: 'HK-2024-001',
    });
    const lines = buildInvoiceDisplayLines(charge);
    expect(lines.some((l) => l.includes('מספר הקצאה: HK-2024-001'))).toBe(true);
  });
});

// ── null-guard: getAllocationNumber ───────────────────────────────────────────

describe('getAllocationNumber — null-safe accessor', () => {
  it('returns the allocation number string when present', () => {
    expect(getAllocationNumber({ allocationNumber: 'HK-001' })).toBe('HK-001');
  });

  it('returns null when allocationNumber is null — does NOT throw', () => {
    expect(() => getAllocationNumber({ allocationNumber: null })).not.toThrow();
    expect(getAllocationNumber({ allocationNumber: null })).toBeNull();
  });
});

// ── isPendingAllocation ───────────────────────────────────────────────────────

describe('isPendingAllocation', () => {
  it('returns true for pending_allocation status', () => {
    const charge = ProviderVatResponseSchema.parse({
      ...BASE_RESPONSE,
      allocationNumber: null,
      status: 'pending_allocation' as const,
    });
    expect(isPendingAllocation(charge)).toBe(true);
  });

  it('returns false for settled with null allocationNumber', () => {
    const charge = ProviderVatResponseSchema.parse({
      ...BASE_RESPONSE,
      allocationNumber: null,
      status: 'settled' as const,
    });
    expect(isPendingAllocation(charge)).toBe(false);
  });
});
