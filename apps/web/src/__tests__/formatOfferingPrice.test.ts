import { describe, expect, it } from 'vitest';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';

const t = ((key: string, opts?: { amount?: string; defaultValue?: string }) => {
  if (key === 'billing.price_per_month') return `${opts?.amount} / month`;
  if (key === 'billing.price_one_time') return `${opts?.amount} (one-time)`;
  return opts?.defaultValue ?? key;
}) as import('i18next').TFunction;

describe('formatOfferingPrice', () => {
  it('appends / month for recurring monthly offerings', () => {
    expect(
      formatOfferingPrice(t, 28000, 'ILS', 'en', {
        billing_mode: 'recurring',
        billing_interval: 'monthly',
      }),
    ).toMatch(/\/ month$/);
  });

  it('marks one-time offerings', () => {
    expect(
      formatOfferingPrice(t, 35000, 'ILS', 'en', {
        billing_mode: 'one_time',
        billing_interval: null,
      }),
    ).toMatch(/\(one-time\)$/);
  });

  it('returns plain amount when billing is unknown', () => {
    const result = formatOfferingPrice(t, 28000, 'ILS', 'en');
    expect(result).not.toMatch(/month|one-time/);
  });
});
