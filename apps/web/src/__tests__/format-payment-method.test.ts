import { describe, expect, it } from 'vitest';
import { formatPaymentMethodDisplay } from '../../../../packages/shared/src/email/format-payment-method.ts';

describe('formatPaymentMethodDisplay', () => {
  const strings = {
    payment_method_card: '{brand} ending in {last4}',
    payment_method_cash: 'Cash',
    payment_method_bank_transfer: 'Bank transfer',
    payment_method_check: 'Check',
    payment_method_other: 'Other',
  };

  it('formats card with brand and last4', () => {
    expect(
      formatPaymentMethodDisplay({
        method: 'card',
        cardBrand: 'Visa',
        last4: '4242',
        strings,
      }),
    ).toBe('Visa ending in 4242');
  });

  it('falls back to brand only when last4 missing', () => {
    expect(
      formatPaymentMethodDisplay({
        method: 'card',
        cardBrand: 'Visa',
        strings,
      }),
    ).toBe('Visa');
  });

  it('formats cash', () => {
    expect(formatPaymentMethodDisplay({ method: 'cash', strings })).toBe('Cash');
  });

  it('formats bank transfer', () => {
    expect(formatPaymentMethodDisplay({ method: 'bank_transfer', strings })).toBe('Bank transfer');
  });
});
