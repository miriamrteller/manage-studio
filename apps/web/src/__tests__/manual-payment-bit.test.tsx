// @vitest-environment jsdom
/**
 * "Record a payment" PR 1: Bit is a method a studio can record for a project payment, next to
 * bank transfer and cash. Fakes only.
 * Run: pnpm -C apps/web test manual-payment-bit.test.tsx
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/features/finance/hooks/useManualPaymentMethods', () => ({
  useManualPaymentMethods: () => ['cash', 'bank_transfer', 'bit'],
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', invoicing_provider: 'ypay' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { ManualPaymentDialog } from '../features/jobs/components/ManualPaymentDialog';
import { MANUAL_PAYMENT_METHODS, isManualPaymentMethod } from '../features/finance/lib/manualPaymentMethods';

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no <dialog> modal API.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

describe('manual payment methods', () => {
  it('are cash, bank transfer and Bit', () => {
    expect(MANUAL_PAYMENT_METHODS).toEqual(['cash', 'bank_transfer', 'bit']);
    expect(isManualPaymentMethod('bit')).toBe(true);
    expect(isManualPaymentMethod('card')).toBe(false);
    expect(isManualPaymentMethod(null)).toBe(false);
  });

  it('a project payment can be recorded as Bit', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(undefined);
    const request = { id: 'jpr-1', label: 'Deposit', amount_minor: 50000, currency: 'ILS', payment_id: null } as never;
    render(
      <ManualPaymentDialog
        action={{ kind: 'mark_paid', request }}
        language="en"
        isSubmitting={false}
        onClose={vi.fn()}
        onMarkPaid={onMarkPaid}
        onRefund={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'payment_methods.bit' }));
    fireEvent.click(screen.getByRole('button', { name: 'pages.jobs.payments.manual.confirmPaid' }));
    await waitFor(() => expect(onMarkPaid).toHaveBeenCalledWith('jpr-1', 'bit', undefined, true));
  });
});

describe('Bit / PayBox only where it can be receipted (owner decision 2026-11-04)', () => {
  it('is shown when the invoicing issues its receipt or the studio issues no documents', async () => {
    const { manualPaymentMethodsFor } = await import('../features/finance/lib/manualPaymentMethods');
    for (const invoicingProvider of ['ypay', 'green_invoice', 'none', 'mock']) {
      expect(manualPaymentMethodsFor({ invoicingProvider, acceptUnreceiptedBit: false })).toContain('bit');
    }
  });

  it('is hidden for Grow, iCount and Invoice4U unless the studio accepts it anyway', async () => {
    const { manualPaymentMethodsFor } = await import('../features/finance/lib/manualPaymentMethods');
    for (const invoicingProvider of ['grow', 'icount', 'invoice4u', 'tranzila', 'yesh']) {
      expect(manualPaymentMethodsFor({ invoicingProvider, acceptUnreceiptedBit: false })).toEqual(['cash', 'bank_transfer']);
      expect(manualPaymentMethodsFor({ invoicingProvider, acceptUnreceiptedBit: true })).toContain('bit');
    }
  });
});
