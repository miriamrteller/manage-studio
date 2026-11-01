// @vitest-environment jsdom
/**
 * Admin settings for studios that take payment at the studio: the payment-mode switch with
 * instructions, the tax-documents switch, and the instructions in the public notice.
 * Run: pnpm -C apps/web test offline-payments-settings.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflinePaymentsSettingsForm, resolvePaymentProviderToSave } from '../features/settings/components/OfflinePaymentsSettingsForm';
import { InvoicingToggleForm, resolveInvoicingProviderToSave } from '../features/settings/components/InvoicingToggleForm';
import { OfflinePaymentNotice } from '../features/enrolment/components/OfflinePaymentNotice';

const { update, eq, tenantState } = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  tenantState: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ update: (p: unknown) => { update(p); return { eq: (...a: unknown[]) => eq(...a) }; } }) },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...tenantState }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

afterEach(() => {
  cleanup();
  update.mockReset();
  eq.mockReset();
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

describe('save values', () => {
  it('maps the switches to the #114 slugs', () => {
    expect(resolvePaymentProviderToSave({ offline: true, onlineProvider: 'ypay' })).toBe('offline');
    expect(resolvePaymentProviderToSave({ offline: false, onlineProvider: 'ypay' })).toBe('ypay');
    expect(resolveInvoicingProviderToSave({ enabled: false, selectedProvider: 'grow' })).toBe('none');
    expect(resolveInvoicingProviderToSave({ enabled: true, selectedProvider: 'ypay' })).toBe('ypay');
  });
});

describe('OfflinePaymentsSettingsForm', () => {
  it('offline studio: shows its instructions and the receipts note, saves trimmed text', async () => {
    Object.assign(tenantState, { payment_provider: 'offline', offline_payment_instructions: 'Old' });
    eq.mockResolvedValue({ error: null });
    wrap(<OfflinePaymentsSettingsForm />);
    expect(screen.getByRole('checkbox', { name: 'settings.offline_payments.enabled_label' })).toBeChecked();
    expect(screen.getByRole('note')).toHaveTextContent('settings.offline_payments.receipts_note');
    const box = screen.getByLabelText('settings.offline_payments.instructions_label');
    expect(box).toHaveValue('Old');
    fireEvent.change(box, { target: { value: '  Bank 12  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ payment_provider: 'offline', offline_payment_instructions: 'Bank 12' }),
    );
    expect(eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('switching a card studio to pay-at-the-studio saves offline; mock is never offered', async () => {
    Object.assign(tenantState, { payment_provider: 'ypay' });
    eq.mockResolvedValue({ error: null });
    wrap(<OfflinePaymentsSettingsForm />);
    const select = screen.getByRole('combobox', { name: 'settings.payments.provider' });
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).not.toContain('mock');
    fireEvent.click(screen.getByRole('checkbox', { name: 'settings.offline_payments.enabled_label' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ payment_provider: 'offline', offline_payment_instructions: null }),
    );
  });
});

describe('InvoicingToggleForm', () => {
  it('invoicing off shows the registered-business note; turning off a provider saves none', async () => {
    Object.assign(tenantState, { invoicing_provider: 'ypay', payment_provider: 'ypay' });
    eq.mockResolvedValue({ error: null });
    wrap(<InvoicingToggleForm />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'settings.invoicing_toggle.enabled_label' }));
    expect(screen.getByRole('note')).toHaveTextContent('settings.invoicing_toggle.off_note');
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ invoicing_provider: 'none' }));
  });
});

describe('OfflinePaymentNotice', () => {
  it('shows the studio instructions when set', () => {
    wrap(<OfflinePaymentNotice instructions={'Bank 12\ncash at the desk'} />);
    expect(screen.getByTestId('offline-payment-instructions')).toHaveTextContent('Bank 12');
  });
  it('hides the block when the studio wrote nothing', () => {
    wrap(<OfflinePaymentNotice instructions="  " />);
    expect(screen.queryByTestId('offline-payment-instructions')).toBeNull();
  });
});
