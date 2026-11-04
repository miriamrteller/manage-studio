// @vitest-environment jsdom
/**
 * Record a payment, PR 2 (owner decision 2026-11-04): a studio that issues no tax documents
 * emails the payer a payment confirmation that says it is NOT a tax document. A tick, on by
 * default, lets the admin skip it; a dismissible nudge points to Settings → Invoicing. Never
 * blocks recording. Fakes only.
 * Run: pnpm -C apps/web test no-document-confirmation.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { invoke, tenant } = vi.hoisted(() => ({
  invoke: vi.fn(),
  tenant: { id: 't1', invoicing_provider: 'none' } as Record<string, unknown>,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => tenant }));
vi.mock('@/features/finance/hooks/useManualPaymentMethods', () => ({
  useManualPaymentMethods: () => ['cash', 'bank_transfer', 'bit'],
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { RecordPaymentModal } from '../features/finance/components/RecordPaymentModal';
import { offersNoDocumentConfirmation } from '../features/finance/components/NoDocumentConfirmationOption';
import {
  needsNoDocumentConfirmation,
  renderNoDocumentConfirmation,
} from '../../../../supabase/functions/_shared/payments/send-payment-confirmation-email.ts';

afterEach(() => {
  cleanup();
  invoke.mockReset();
  tenant.invoicing_provider = 'none';
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

const wrap = (ui: ReactNode) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );

describe('rules', () => {
  it('only studios with no invoicing, only for money they recorded themselves', () => {
    expect(offersNoDocumentConfirmation('none')).toBe(true);
    expect(offersNoDocumentConfirmation('ypay')).toBe(false);
    const recorded = { provider: 'manual', payment_method: 'bit' };
    expect(needsNoDocumentConfirmation({ invoicingProvider: 'none', payment: recorded })).toBe(true);
    expect(needsNoDocumentConfirmation({ invoicingProvider: 'ypay', payment: recorded })).toBe(false);
    expect(needsNoDocumentConfirmation({ invoicingProvider: 'none', payment: { provider: 'grow', payment_method: 'card' } })).toBe(false);
  });

  it('the email says it is not a tax document, in English and Hebrew', () => {
    const en = renderNoDocumentConfirmation({ language: 'en', studioName: 'Creative Ballet', recipientName: 'Dana', amount: '₪350.00', paymentMethod: 'cash', paidOn: '4 November 2026' });
    expect(en.subject).toBe('Payment confirmation — Creative Ballet');
    expect(en.html).toContain('not a tax document');
    expect(en.html).toContain('in cash');
    const he = renderNoDocumentConfirmation({ language: 'he', studioName: 'בלט', recipientName: '', amount: '₪350.00', paymentMethod: 'bit', paidOn: '4 בנובמבר 2026' });
    expect(he.html).toContain('ואינו מסמך מס');
    expect(he.html).toContain('בביט / פייבוקס');
    expect(he.html).toContain('dir="rtl"');
    const escaped = renderNoDocumentConfirmation({ language: 'en', studioName: '<b>x</b>', recipientName: '', amount: '1', paymentMethod: null, paidOn: 'today' });
    expect(escaped.html).not.toContain('<b>x</b>');
  });
});

describe('Record a payment dialog', () => {
  it('ticks "Email the payer" by default and sends it; unticking sends false', async () => {
    invoke.mockResolvedValue({ data: { ok: true, paymentId: 'p1' }, error: null });
    wrap(<RecordPaymentModal engagementId="eng-1" defaultAmountMinor={35000} currency="ILS" onRecorded={vi.fn()} />);
    const tick = screen.getByRole('checkbox', { name: 'finance.no_document.send_label' });
    expect(tick).toBeChecked();
    expect(screen.getByRole('note').textContent).toContain('finance.no_document.nudge');
    fireEvent.click(screen.getByRole('button', { name: 'finance.no_document.dismiss' }));
    expect(screen.queryByText('finance.no_document.nudge', { exact: false })).toBeNull();
    fireEvent.click(tick);
    fireEvent.click(screen.getByRole('button', { name: 'finance.record_payment.submit' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('record-payment', { body: expect.objectContaining({ send_confirmation: false }) }),
    );
  });

  it('a studio with invoicing sees neither the tick nor the nudge', () => {
    tenant.invoicing_provider = 'ypay';
    wrap(<RecordPaymentModal engagementId="eng-1" defaultAmountMinor={35000} currency="ILS" onRecorded={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'finance.no_document.send_label' })).toBeNull();
    expect(screen.queryByText('finance.no_document.nudge', { exact: false })).toBeNull();
  });
});
