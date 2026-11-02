// @vitest-environment jsdom
/**
 * Beta provider-switch rule (owner decision): a studio may only move from paying at the studio
 * with no tax documents to Grow, YPay or Invoice4U. The database enforces it
 * (supabase/tests/provider-switch); this checks the web copy of the rule and that a refused
 * save tells the admin to contact support.
 * Run: pnpm -C apps/web test provider-switch-rule.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  canChoosePaymentProvider,
  isProviderSwitchBlockedError,
  paymentProviderSwitchAllowed,
} from '@/lib/providerPairing';
import { GrowSettingsForm } from '../features/settings/components/GrowSettingsForm';

const { rpc, tenantState } = vi.hoisted(() => ({
  rpc: vi.fn(),
  tenantState: {} as Record<string, unknown>,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, functions: { invoke: vi.fn() }, from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...tenantState }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('../features/finance-admin/components/FinanceHealthCard', () => ({ FinanceHealthCard: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  rpc.mockReset();
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

const offlineNone = { payment: 'offline', invoicing: 'none' };

describe('paymentProviderSwitchAllowed', () => {
  it('allows only pay at the studio (no documents) to Grow, YPay or Invoice4U', () => {
    for (const to of ['grow', 'ypay', 'invoice4u']) {
      expect(paymentProviderSwitchAllowed(offlineNone, { payment: to })).toBe(true);
      expect(paymentProviderSwitchAllowed(offlineNone, { payment: to, invoicing: to })).toBe(true);
      expect(paymentProviderSwitchAllowed(offlineNone, { payment: to, invoicing: 'green_invoice' })).toBe(false);
    }
    expect(paymentProviderSwitchAllowed(offlineNone, { payment: 'icount' })).toBe(false);
    expect(paymentProviderSwitchAllowed(offlineNone, { payment: 'tranzila' })).toBe(false);
    expect(paymentProviderSwitchAllowed({ payment: 'offline', invoicing: 'ypay' }, { payment: 'grow' })).toBe(false);
  });

  it('blocks online to online and online to pay at the studio', () => {
    expect(paymentProviderSwitchAllowed({ payment: 'grow', invoicing: 'grow' }, { payment: 'ypay' })).toBe(false);
    expect(paymentProviderSwitchAllowed({ payment: 'ypay', invoicing: 'ypay' }, { payment: 'grow' })).toBe(false);
    expect(paymentProviderSwitchAllowed({ payment: 'grow', invoicing: 'none' }, { payment: 'offline' })).toBe(false);
    // Keeping the same provider is not a switch.
    expect(paymentProviderSwitchAllowed({ payment: 'grow', invoicing: 'grow' }, { payment: 'grow' })).toBe(true);
  });

  it('canChoosePaymentProvider is true only for pay at the studio with no documents', () => {
    expect(canChoosePaymentProvider({ payment_provider: 'offline', invoicing_provider: 'none' })).toBe(true);
    expect(canChoosePaymentProvider({ payment_provider: 'offline', invoicing_provider: null })).toBe(true);
    expect(canChoosePaymentProvider({ payment_provider: 'offline', invoicing_provider: 'ypay' })).toBe(false);
    expect(canChoosePaymentProvider({ payment_provider: 'grow', invoicing_provider: 'none' })).toBe(false);
  });

  it('recognises the database refusal', () => {
    expect(isProviderSwitchBlockedError({ message: 'payment_provider_switch_blocked' })).toBe(true);
    expect(isProviderSwitchBlockedError(new Error('tenant_admin role required'))).toBe(false);
    expect(isProviderSwitchBlockedError(null)).toBe(false);
  });
});

function fillGrow() {
  fireEvent.change(screen.getByLabelText('Grow user ID'), { target: { value: 'user-1' } });
  fireEvent.change(screen.getByLabelText('Page code'), { target: { value: 'page-1' } });
  fireEvent.change(screen.getAllByLabelText('API key').at(-1)!, { target: { value: 'key-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GrowSettingsForm embedded />
    </QueryClientProvider>,
  );

describe('Grow keys', () => {
  it('a studio paying at the studio connects Grow and gets its webhook key', async () => {
    Object.assign(tenantState, { payment_provider: 'offline', invoicing_provider: 'none' });
    rpc.mockImplementation(async (name: string) => {
      if (name === 'get_grow_webhook_key_status') return { data: [{ configured: false }], error: null };
      if (name === 'rotate_grow_webhook_key') return { data: 'whk_new', error: null };
      return { data: null, error: null };
    });
    wrap();
    fillGrow();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('save_tenant_grow_credentials', {
        p_user_id: 'user-1',
        p_page_code: 'page-1',
        p_api_key: 'key-1',
      }),
    );
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('rotate_grow_webhook_key'));
    expect(await screen.findByDisplayValue('whk_new')).toBeTruthy();
  });

  it('a refused switch tells the admin to contact support', async () => {
    Object.assign(tenantState, { payment_provider: 'ypay', invoicing_provider: 'ypay' });
    rpc.mockImplementation(async (name: string) => {
      if (name === 'save_tenant_grow_credentials') {
        return { data: null, error: { message: 'payment_provider_switch_blocked', code: '42501' } };
      }
      if (name === 'get_grow_webhook_key_status') return { data: [{ configured: false }], error: null };
      return { data: null, error: null };
    });
    wrap();
    fillGrow();
    expect(await screen.findByText('settings.offline_payments.switch_contact_support')).toBeTruthy();
    expect(rpc).not.toHaveBeenCalledWith('rotate_grow_webhook_key');
  });
});
