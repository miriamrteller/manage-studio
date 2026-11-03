// @vitest-environment jsdom
/**
 * Settings "Your business": the payment flow and the three switches save through the audited
 * setter, and switching classes off only informs (never refuses).
 * Run: pnpm -C apps/web test business-settings.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BusinessSettings } from '../features/settings/components/BusinessSettings';

const { rpc, countResult, tenantState } = vi.hoisted(() => ({
  rpc: vi.fn(),
  countResult: { count: 0 },
  tenantState: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ count: countResult.count, error: null }) }) }),
  },
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 'tenant-1', ...tenantState }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: { count?: number }) => (o?.count !== undefined ? `${k}:${o.count}` : k) }),
}));

afterEach(() => {
  cleanup();
  rpc.mockReset();
  countResult.count = 0;
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

const wrap = () => render(<QueryClientProvider client={new QueryClient()}><BusinessSettings /></QueryClientProvider>);
const profile = (over = {}) => ({ paymentFlow: 'recurring', teachesClasses: true, familyAccounts: true, clientBooking: true, ...over });

describe('BusinessSettings', () => {
  it('shows the studio\'s current choices and starts with nothing to save', () => {
    tenantState.profile = profile();
    wrap();
    expect(screen.getByRole('radio', { name: 'settings.business.flow_recurring' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /settings.business.classes_label/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'settings.business.save' })).toBeDisabled();
  });

  it('saves every choice through set_business_profile', async () => {
    tenantState.profile = profile({ teachesClasses: false, familyAccounts: false });
    rpc.mockResolvedValue({ error: null });
    wrap();
    fireEvent.click(screen.getByRole('radio', { name: 'settings.business.flow_both' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /settings.business.families_label/ }));
    fireEvent.click(screen.getByRole('button', { name: 'settings.business.save' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_business_profile', {
        p_tenant_id: 'tenant-1',
        p_payment_flow: 'both',
        p_teaches_classes: false,
        p_family_accounts: true,
        p_client_booking: true,
      }),
    );
  });

  it('switching classes off with active enrolments saves, then shows a dismissible notice', async () => {
    tenantState.profile = profile();
    countResult.count = 3;
    rpc.mockResolvedValue({ error: null });
    wrap();
    fireEvent.click(screen.getByRole('checkbox', { name: /settings.business.classes_label/ }));
    fireEvent.click(screen.getByRole('button', { name: 'settings.business.save' }));
    expect(await screen.findByText('settings.business.classes_off_notice:3')).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'settings.business.dismiss' }));
    expect(screen.queryByText('settings.business.classes_off_notice:3')).toBeNull();
  });

  it('no notice when there are no active enrolments', async () => {
    tenantState.profile = profile();
    rpc.mockResolvedValueOnce({ error: null });
    wrap();
    fireEvent.click(screen.getByRole('checkbox', { name: /settings.business.classes_label/ }));
    fireEvent.click(screen.getByRole('button', { name: 'settings.business.save' }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
