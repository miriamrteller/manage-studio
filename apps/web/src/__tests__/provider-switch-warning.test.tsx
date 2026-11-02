// @vitest-environment jsdom
/**
 * Switching payment provider (payments audit P2 #13): before saving, Settings shows what still
 * depends on the old provider (pending charges, saved cards, active monthly plans) and asks the
 * admin to confirm. Nothing is deleted; the old provider's details stay saved.
 * Run: pnpm -C apps/web test provider-switch-warning.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { update, counts, filters, tenantState } = vi.hoisted(() => ({
  update: vi.fn(),
  counts: {} as Record<string, number>,
  filters: [] as { table: string; col: string; val: unknown }[],
  tenantState: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const q: Record<string, unknown> = {
          eq: (col: string, val: unknown) => { filters.push({ table, col, val }); return q; },
          is: (col: string, val: unknown) => { filters.push({ table, col, val }); return q; },
          then: (r: (v: unknown) => unknown) => Promise.resolve({ count: counts[table] ?? 0, error: null }).then(r),
        };
        return q;
      },
      update: (p: unknown) => { update(p); return { eq: async () => ({ error: null }) }; },
    }),
  },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...tenantState }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${k}:${String(o.count)}` : k),
    i18n: { language: 'en' },
  }),
}));

import { OfflinePaymentsSettingsForm } from '../features/settings/components/OfflinePaymentsSettingsForm';

afterEach(() => {
  cleanup();
  update.mockReset();
  filters.length = 0;
  for (const k of Object.keys(counts)) delete counts[k];
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const save = () => screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
const chooseProvider = (slug: string) =>
  fireEvent.change(screen.getByLabelText('settings.payments.provider'), { target: { value: slug } });

describe('switching from one online provider to another', () => {
  it('lists what still uses the old provider and asks for confirmation before saving', async () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'green_invoice' });
    Object.assign(counts, { payments: 2, payment_method_tokens: 5, billing_schedules: 3 });
    wrap(<OfflinePaymentsSettingsForm />);

    chooseProvider('ypay');
    expect(await screen.findByText('settings.provider_switch.pending_charges:2')).toBeTruthy();
    expect(screen.getByText('settings.provider_switch.saved_cards:5')).toBeTruthy();
    expect(screen.getByText('settings.provider_switch.active_schedules:3')).toBeTruthy();
    expect(screen.getByText('settings.provider_switch.details_kept')).toBeTruthy();
    expect(save().disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'settings.provider_switch.confirm' }));
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ payment_provider: 'ypay' })));
  });

  it("counts only the old provider's pending charges and live saved cards", async () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'green_invoice' });
    wrap(<OfflinePaymentsSettingsForm />);
    chooseProvider('ypay');
    await screen.findByText('settings.provider_switch.details_kept');
    expect(filters).toEqual(expect.arrayContaining([
      { table: 'payments', col: 'provider', val: 'grow' },
      { table: 'payments', col: 'status', val: 'pending' },
      { table: 'payment_method_tokens', col: 'provider', val: 'grow' },
      { table: 'payment_method_tokens', col: 'revoked_at', val: null },
      { table: 'billing_schedules', col: 'status', val: 'active' },
    ]));
  });

  it('needs no confirmation when nothing depends on the old provider', async () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'green_invoice' });
    wrap(<OfflinePaymentsSettingsForm />);
    chooseProvider('ypay');
    await screen.findByText('settings.provider_switch.details_kept');
    expect(screen.queryByRole('checkbox', { name: 'settings.provider_switch.confirm' })).toBeNull();
    await waitFor(() => expect(save().disabled).toBe(false));
  });

  it('asks again after the admin picks a different provider', async () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'green_invoice' });
    Object.assign(counts, { payment_method_tokens: 1 });
    wrap(<OfflinePaymentsSettingsForm />);
    chooseProvider('ypay');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'settings.provider_switch.confirm' }));
    expect(save().disabled).toBe(false);
    chooseProvider('invoice4u');
    await waitFor(() => expect(save().disabled).toBe(true));
  });
});

describe('no warning', () => {
  it('when the provider does not change', () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'grow' });
    wrap(<OfflinePaymentsSettingsForm />);
    expect(screen.queryByText('settings.provider_switch.title')).toBeNull();
    expect(save().disabled).toBe(false);
  });

  it('when a pay-at-the-studio studio starts taking card payments', () => {
    Object.assign(tenantState, { payment_provider: 'offline', invoicing_provider: 'none' });
    wrap(<OfflinePaymentsSettingsForm />);
    fireEvent.click(screen.getByLabelText('settings.offline_payments.enabled_label'));
    expect(screen.queryByText('settings.provider_switch.title')).toBeNull();
  });
});
