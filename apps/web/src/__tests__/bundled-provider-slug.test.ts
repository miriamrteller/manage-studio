/**
 * I3-T5 — bundled provider helper uses matching slugs only.
 */
import { describe, it, expect } from 'vitest';
import { tenantUsesBundledProvider } from '@/lib/tenantProviderRouting';

describe('tenantUsesBundledProvider (I3-T5)', () => {
  it('returns true for matching grow/grow slugs', () => {
    expect(
      tenantUsesBundledProvider({ payment_provider: 'grow', invoicing_provider: 'grow' }),
    ).toBe(true);
  });

  it('returns true for matching icount/icount slugs', () => {
    expect(
      tenantUsesBundledProvider({ payment_provider: 'icount', invoicing_provider: 'icount' }),
    ).toBe(true);
  });

  it('returns false when payment and invoicing slugs mismatch', () => {
    expect(
      tenantUsesBundledProvider({ payment_provider: 'icount', invoicing_provider: 'grow' }),
    ).toBe(false);
  });

  it('returns false for stripe + green_invoice split', () => {
    expect(
      tenantUsesBundledProvider({
        payment_provider: 'stripe',
        invoicing_provider: 'green_invoice',
      }),
    ).toBe(false);
  });
});
