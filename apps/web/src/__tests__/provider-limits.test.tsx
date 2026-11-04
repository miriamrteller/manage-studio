// @vitest-environment jsdom
/**
 * "What it can't do" lines under every provider option (owner decision 2026-11-04): every
 * offered provider stays listed, each line exists in English and Hebrew, unverified points read
 * "check with <provider>", and nothing blocks the choice.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';
import { providerLimitKeys } from '@/lib/providerLimits';
import { invoicingOptionsFor } from '@/lib/providerPairing';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import { PAYMENT_CHOICES, PaymentProviderChoice } from '@/features/settings/components/PaymentProviderChoice';

afterEach(cleanup);

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
}

const OFFERED_INVOICING = ['grow', 'invoice4u', 'ypay', 'green_invoice'];

describe('provider limits', () => {
  it('every offered provider has lines, in English and Hebrew', () => {
    for (const slug of PAYMENT_CHOICES) {
      expect(providerLimitKeys('payment', slug).length, slug).toBeGreaterThan(0);
    }
    for (const slug of OFFERED_INVOICING) {
      expect(providerLimitKeys('invoicing', slug).length, slug).toBeGreaterThan(0);
    }
    const keys = [
      ...PAYMENT_CHOICES.flatMap((s) => providerLimitKeys('payment', s)),
      ...OFFERED_INVOICING.flatMap((s) => providerLimitKeys('invoicing', s)),
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(he, key), `he ${key}`).toBe('string');
    }
  });

  it('branding is never claimed: it reads "check with <provider>"', () => {
    for (const slug of OFFERED_INVOICING) {
      const key = `provider_limits.invoicing.${slug}.branding_check`;
      expect(String(lookup(en, key))).toMatch(/check with/);
      expect(String(lookup(he, key))).toMatch(/בדקו עם/);
    }
  });

  it('unfinished providers stay hidden: no lines and not offered', () => {
    expect(providerLimitKeys('invoicing', 'tranzila')).toEqual([]);
    expect(providerLimitKeys('invoicing', 'yesh')).toEqual([]);
    expect(invoicingOptionsFor('offline')).not.toContain('tranzila');
    expect(invoicingOptionsFor('offline')).not.toContain('yesh');
  });
});

describe('How customers pay', () => {
  it('lists every provider with its lines; a monthly studio picking YPay gets a note, not a block', () => {
    const onChange = vi.fn();
    render(<PaymentProviderChoice idPrefix="t" monthlyFees provider="ypay" onProviderChange={onChange} />);
    for (const slug of PAYMENT_CHOICES) {
      expect(screen.getByRole('radio', { name: `studio_setup.payment_${slug}` })).toBeTruthy();
    }
    expect(screen.getByRole('radio', { name: 'studio_setup.payment_ypay' })).toHaveAccessibleDescription(
      'provider_limits.payment.ypay.no_saved_cards provider_limits.payment.ypay.refunds_in_provider',
    );
    expect(screen.getByText('payment_choice.no_monthly_warning')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'studio_setup.payment_grow' }));
    expect(onChange).toHaveBeenCalledWith('grow');
  });
});
