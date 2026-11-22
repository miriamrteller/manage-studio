// @vitest-environment jsdom
/**
 * The gallery email's one button (/shop/:token): signs the client in and lands on that
 * shoot's gallery in the photo shop (owner, 22 Nov 2026), whether or not someone was
 * signed in before. Run: pnpm -C apps/web test shop-link-page
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import ShopLinkPage from '@/pages/ShopLinkPage';
import { renderInApp, setLanguage } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
const invoke = vi.hoisted(() => vi.fn());
const setSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, auth: { setSession } } }));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

describe('ShopLinkPage', () => {
  beforeEach(async () => {
    await setLanguage('en');
    invoke.mockReset();
    setSession.mockReset();
    invoke.mockResolvedValue({ data: { ok: true, access_token: 'a', refresh_token: 'r', engagementId: 'e1' }, error: null });
    setSession.mockResolvedValue({ error: null });
  });

  it('lands on that shoot\'s gallery in the photo shop, and the token leaves the address', async () => {
    renderInApp(<ShopLinkPage />, {
      path: '/shop/:token',
      initialEntry: '/shop/tok123',
      extraRoutes: { '/photos/:engagementId': <Where /> },
    });
    expect(await screen.findByTestId('where')).toHaveTextContent('/photos/e1');
    expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    expect(window.location.href).not.toContain('tok123');
    expect(window.location.pathname).not.toBe('/shop');
  });

  it('an expired link says so and offers sign-in', async () => {
    invoke.mockResolvedValue({ data: { ok: false, code: 'expired' }, error: null });
    renderInApp(<ShopLinkPage />, { path: '/shop/:token', initialEntry: '/shop/old' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
  });
});
