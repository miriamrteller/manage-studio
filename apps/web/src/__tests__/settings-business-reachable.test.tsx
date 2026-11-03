// @vitest-environment jsdom
/**
 * "Your business" (payment flow and the three switches) must be reachable from the real Settings
 * page. It was only rendered by TenantSettingsHub, which nothing imported (issue found on #294).
 * Run: pnpm -C apps/web test settings-business-reachable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import TenantSettingsPage from '@/pages/TenantSettingsPage';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());

beforeEach(async () => {
  setTenant('dance');
  await setLanguage('en');
});

describe('Settings page', () => {
  it('has a "Your business" tab that shows the payment flow and the three switches', () => {
    renderInApp(<TenantSettingsPage />);
    // The tab list is rendered for phone and desktop; either one opens the section.
    fireEvent.click(screen.getAllByRole('tab', { name: /Your business/ })[0]);
    expect(screen.getByRole('heading', { name: 'Your business' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I teach classes/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Parents pay for children/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Clients book time slots/ })).toBeInTheDocument();
  });

  it('opens straight on it with ?tab=business, in Hebrew too', async () => {
    await setLanguage('he');
    renderInApp(<TenantSettingsPage />, {
      path: '/admin/setup/settings',
      initialEntry: '/admin/setup/settings?tab=business',
    });
    expect(screen.getByRole('heading', { name: 'העסק שלכם' })).toBeInTheDocument();
  });
});
