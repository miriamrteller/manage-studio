// @vitest-environment jsdom
/**
 * "What OpalSwift can't do" lines under every provider option (owner decision 2026-11-04):
 * every offered provider has them, in English and Hebrew, stating only confirmed facts.
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

import { PaymentProviderChoice } from '@/features/settings/components/PaymentProviderChoice';

const PAYMENT_CHOICES = ['grow', 'ypay', 'invoice4u', 'offline'];

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

  it('states only what OpalSwift does: no hedged "check with" lines', () => {
    const keys = [
      ...PAYMENT_CHOICES.flatMap((s) => providerLimitKeys('payment', s)),
      ...OFFERED_INVOICING.flatMap((s) => providerLimitKeys('invoicing', s)),
    ];
    for (const key of keys) {
      expect(String(lookup(en, key))).not.toMatch(/check with/i);
      expect(String(lookup(he, key))).not.toMatch(/בדקו עם/);
    }
  });

  it('no line speaks about monthly charges (owner instruction)', () => {
    const keys = [
      ...PAYMENT_CHOICES.flatMap((s) => providerLimitKeys('payment', s)),
      ...OFFERED_INVOICING.flatMap((s) => providerLimitKeys('invoicing', s)),
    ];
    for (const key of keys) {
      expect(String(lookup(en, key))).not.toMatch(/monthly/i);
      expect(String(lookup(he, key))).not.toMatch(/חודשי/);
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
  it('each option points at its lines; Grow is listed only when it is the saved choice', () => {
    const onChange = vi.fn();
    render(<PaymentProviderChoice idPrefix="t" monthlyFees={false} provider="ypay" onProviderChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'studio_setup.payment_ypay' })).toHaveAccessibleDescription(
      'provider_limits.payment.ypay.no_refunds',
    );
    expect(screen.getByRole('radio', { name: 'studio_setup.payment_offline' })).toHaveAccessibleDescription(
      'provider_limits.payment.offline.no_cards',
    );
    expect(screen.queryByRole('radio', { name: 'studio_setup.payment_grow' })).toBeNull();
    expect(screen.getByRole('radio', { name: /payment_choice.takbull_label/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'studio_setup.payment_offline' }));
    expect(onChange).toHaveBeenCalledWith('offline');
    cleanup();
    render(<PaymentProviderChoice idPrefix="t" monthlyFees={false} provider="grow" onProviderChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'studio_setup.payment_grow' })).toHaveAccessibleDescription(
      'provider_limits.payment.grow.recorded_receipts',
    );
    expect(screen.queryByRole('radio', { name: 'studio_setup.payment_invoice4u' })).toBeNull();
  });
});
