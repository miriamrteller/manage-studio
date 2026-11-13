// @vitest-environment jsdom
/**
 * "Your business" ("How do clients work with you?") must be reachable from the real Settings
 * page. It was only rendered by TenantSettingsHub, which nothing imported (issue found on #294).
 * Run: pnpm -C apps/web test settings-business-reachable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import TenantSettingsPage from '@/pages/TenantSettingsPage';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

beforeEach(async () => {
  setTenant('dance');
  await setLanguage('en');
});

describe('Settings page', () => {
  it('has a "Your business" tab that asks how clients work with you', () => {
    // Each section is a tab along the top of Settings, with its own address.
    renderInApp(<TenantSettingsPage />, {
      path: '/admin/settings',
      initialEntry: '/admin/settings?tab=business',
    });
    expect(screen.getByRole('heading', { name: 'Your business' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'How do clients work with you?' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Classes/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Projects/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Appointments/ })).toBeInTheDocument();
    expect(screen.getByText(/pays a deposit to book, and pays the balance later/)).toBeInTheDocument();
  });

  it('opens straight on it with ?tab=business, in Hebrew too', async () => {
    await setLanguage('he');
    renderInApp(<TenantSettingsPage />, {
      path: '/admin/settings',
      initialEntry: '/admin/settings?tab=business',
    });
    expect(screen.getByRole('heading', { name: 'העסק שלכם' })).toBeInTheDocument();
  });
});
