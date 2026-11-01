/**
 * Offline-only tenants (payment_provider = 'none'): the slug parses, is recognised as
 * offline, and never yields a charging adapter.
 * Run: pnpm -C apps/web test offline-payment-registry.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  PAYMENT_PROVIDER_SLUGS,
  isOfflinePaymentProvider,
  parsePaymentProviderSlug,
} from '../../../../supabase/functions/_shared/payments/registry.ts';
import { getPaymentProvider } from '../../../../supabase/functions/_shared/payments/index.ts';

describe('payment provider "none" (pay at the studio)', () => {
  it('is a valid slug and is the only offline slug', () => {
    expect(PAYMENT_PROVIDER_SLUGS).toContain('none');
    expect(parsePaymentProviderSlug('none')).toBe('none');
    expect(isOfflinePaymentProvider('none')).toBe(true);
    for (const slug of PAYMENT_PROVIDER_SLUGS.filter((s) => s !== 'none')) {
      expect(isOfflinePaymentProvider(slug)).toBe(false);
    }
    expect(isOfflinePaymentProvider(null)).toBe(false);
    expect(isOfflinePaymentProvider(undefined)).toBe(false);
  });

  it('still defaults a missing slug to grow (existing tenants unchanged)', () => {
    expect(parsePaymentProviderSlug(null)).toBe('grow');
    expect(parsePaymentProviderSlug(undefined)).toBe('grow');
  });

  it('never returns a charging adapter for an offline tenant', () => {
    expect(() => getPaymentProvider({} as never, 'none')).toThrow(/no online payment provider/);
  });
});
