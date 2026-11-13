// @vitest-environment jsdom
/**
 * Two Settings sections shipped but nobody could reach them (found while fixing the unreachable
 * "Your business"): the Leads tab (enquiry form questions and the daily follow-up email) and the
 * "Tax documents" switch on the Invoicing tab. The unused TenantSettingsHub was their only host.
 * Run: pnpm -C apps/web test settings-leads-invoicing-reachable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import TenantSettingsPage from '@/pages/TenantSettingsPage';
import LeadSettingsPage from '@/pages/LeadSettingsPage';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { id: 'u-1' } }, isLoading: false }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: { lead_form: {} }, error: null }) }),
      }),
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

beforeEach(async () => {
  setTenant('dance', { payment_provider: 'grow', invoicing_provider: 'none' });
  await setLanguage('en');
});

describe('Settings page', () => {
  it('Leads → Enquiry settings has the enquiry form questions and the daily follow-up email', async () => {
    renderInApp(<LeadSettingsPage />, { path: '/admin/leads/settings' });
    expect(await screen.findByRole('heading', { name: 'Questions on your enquiry form' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily follow-up email' })).toBeInTheDocument();
  });

  it('the Invoicing tab lets a studio with no tax documents switch them on', () => {
    renderInApp(<TenantSettingsPage />, {
      path: '/admin/setup/settings',
      initialEntry: '/admin/setup/settings?tab=invoicing',
    });
    expect(screen.getByRole('heading', { name: 'Tax documents' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Issue tax documents automatically/ })).not.toBeChecked();
  });
});
