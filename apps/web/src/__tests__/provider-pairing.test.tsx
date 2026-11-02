// @vitest-environment jsdom
/**
 * Which invoicing services work with which payment providers (payments audit P1 #5): the shared
 * rules, the web and edge copies agreeing, and the two Settings forms refusing a combination
 * whose documents could never be issued.
 * Run: pnpm -C apps/web test provider-pairing.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as web from '@/lib/providerPairing';
import * as edge from '../../../../supabase/functions/_shared/provider-pairing';
import { OfflinePaymentsSettingsForm } from '../features/settings/components/OfflinePaymentsSettingsForm';
import { InvoicingToggleForm, invoicingChoicesFor } from '../features/settings/components/InvoicingToggleForm';

const { update, tenantState } = vi.hoisted(() => ({
  update: vi.fn(),
  tenantState: {} as Record<string, unknown>,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({
    // Provider-switch impact counts (P2 #13): nothing depends on the old provider here.
    select: () => { const q: Record<string, unknown> = { eq: () => q, is: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(r) }; return q; }, update: (p: unknown) => { update(p); return { eq: async () => ({ error: null }) }; } }) },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...tenantState }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

afterEach(() => {
  cleanup();
  update.mockReset();
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const PAYMENTS = ['offline', 'grow', 'icount', 'invoice4u', 'ypay', 'tranzila'];
const INVOICING = ['none', 'grow', 'icount', 'invoice4u', 'ypay', 'green_invoice', 'yesh', 'tranzila'];

describe('pairing rules', () => {
  it('the web and edge copies agree on every combination', () => {
    expect(web.PAIRABLE_INVOICING_PROVIDERS).toEqual(edge.PAIRABLE_INVOICING_PROVIDERS);
    expect(web.UNFINISHED_INVOICING_PROVIDERS).toEqual(edge.UNFINISHED_INVOICING_PROVIDERS);
    for (const p of PAYMENTS) {
      for (const i of INVOICING) {
        expect([p, i, web.invoicingPairsWithPayment(p, i)]).toEqual([p, i, edge.invoicingPairsWithPayment(p, i)]);
      }
    }
  });

  it('offers per payment choice only services that can issue its documents', () => {
    expect(web.invoicingOptionsFor('offline')).toEqual(['ypay', 'green_invoice', 'none']);
    expect(web.invoicingOptionsFor('grow')).toEqual(['grow', 'green_invoice', 'none']);
    expect(web.invoicingOptionsFor('icount')).toEqual(['icount', 'green_invoice', 'none']);
    expect(web.invoicingOptionsFor('invoice4u')).toEqual(['invoice4u', 'green_invoice', 'none']);
    expect(web.invoicingOptionsFor('ypay')).toEqual(['ypay', 'green_invoice', 'none']);
    expect(web.invoicingOptionsFor('tranzila')).toEqual(['green_invoice', 'none']);
  });

  it('never offers Yesh or Tranzila invoicing', () => {
    for (const p of PAYMENTS) {
      expect(web.invoicingPairsWithPayment(p, 'yesh')).toBe(false);
      expect(web.invoicingPairsWithPayment(p, 'tranzila')).toBe(false);
    }
  });
});

describe('Settings → Tax documents', () => {
  it('lists only services that fit the payment provider, keeping an old saved one visible', () => {
    expect(invoicingChoicesFor('grow', 'grow')).toEqual(['grow', 'green_invoice']);
    expect(invoicingChoicesFor('offline', 'none')).toEqual(['ypay', 'green_invoice']);
    // An existing studio saved with Yesh still sees it, so the form shows what is stored.
    expect(invoicingChoicesFor('grow', 'yesh')).toEqual(['yesh', 'grow', 'green_invoice']);
  });

  it('refuses to save documents that cannot be issued, and says why', async () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'yesh' });
    wrap(<InvoicingToggleForm />);
    expect(screen.getByRole('alert')).toHaveTextContent('settings.invoicing_toggle.pairing_problem');
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('settings.invoicing.provider'), { target: { value: 'green_invoice' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ invoicing_provider: 'green_invoice' }));
  });
});

describe('Settings → How customers pay', () => {
  it('blocks switching to pay at the studio while Grow issues the documents', () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'grow' });
    wrap(<OfflinePaymentsSettingsForm />);
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByLabelText('settings.offline_payments.enabled_label'));
    expect(screen.getByRole('alert')).toHaveTextContent('settings.offline_payments.pairing_problem');
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
  });

  it('allows the switch when the documents can still be issued', async () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'green_invoice' });
    wrap(<OfflinePaymentsSettingsForm />);
    fireEvent.click(screen.getByLabelText('settings.offline_payments.enabled_label'));
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.save' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ payment_provider: 'offline' })));
  });
});

describe('Settings → unfinished payment providers (iCount, Tranzila)', () => {
  it('are not offered as a new choice, but a studio already on one still sees it', async () => {
    const { onlinePaymentChoices } = await import('../features/settings/components/OfflinePaymentsSettingsForm');
    expect(onlinePaymentChoices('grow')).toEqual(['grow', 'invoice4u', 'ypay']);
    expect(onlinePaymentChoices('offline')).toEqual(['grow', 'invoice4u', 'ypay']);
    expect(onlinePaymentChoices('icount')).toEqual(['grow', 'icount', 'invoice4u', 'ypay']);
    expect(onlinePaymentChoices('tranzila')).toEqual(['grow', 'invoice4u', 'ypay', 'tranzila']);
  });

  it('labels a saved unfinished provider as not finished', () => {
    Object.assign(tenantState, { payment_provider: 'icount', invoicing_provider: 'icount' });
    wrap(<OfflinePaymentsSettingsForm />);
    const options = Array.from(
      (screen.getByLabelText('settings.payments.provider') as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(options).toEqual(['grow', 'icount', 'invoice4u', 'ypay']);
    expect(screen.getByRole('option', { name: 'settings.offline_payments.provider_not_finished' })).toBeTruthy();
  });
});
