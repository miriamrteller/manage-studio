// @vitest-environment jsdom
/**
 * Studio shop (beta), public page /shop (owner, 22 Nov 2026): anyone sees the items with
 * picture, price and sizes, and which sizes are sold out, but never stock counts. Not signed
 * in: "Sign in to order". Signed in: "Order from my page". Nothing on sale: says so. EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import PublicShopPage from '@/pages/PublicShopPage';
import type { PublicCatalogueItem } from '@/features/shop/services/shopOrdersService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  items: [] as PublicCatalogueItem[],
  user: null as null | { id: string },
  tenantIds: [] as string[],
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: state.user, isLoading: false, isProfileChecked: true, profileTimedOut: false }),
}));
vi.mock('@/features/shop/services/studioShopService', async (orig) => {
  const real = await orig<typeof import('@/features/shop/services/studioShopService')>();
  return { ...real, StudioShopService: { ...real.StudioShopService, imageUrl: (p: string) => `https://cdn.test/${p}` } };
});
vi.mock('@/features/shop/services/shopOrdersService', async (orig) => {
  const real = await orig<typeof import('@/features/shop/services/shopOrdersService')>();
  return {
    ...real,
    ShopOrdersService: {
      ...real.ShopOrdersService,
      publicCatalogue: async (tenantId: string) => {
        state.tenantIds.push(tenantId);
        return state.items;
      },
    },
  };
});

const leotard: PublicCatalogueItem = {
  id: 'p1',
  name: 'Black leotard',
  description: 'Cotton, long sleeves',
  price_minor: 12000,
  currency: 'ILS',
  image_path: 't1/x.jpg',
  variants: [
    { id: 'v1', label: 'Age 4-6', in_stock: false },
    { id: 'v2', label: 'Age 7-9', in_stock: true },
  ],
};
const shoes: PublicCatalogueItem = {
  id: 'p2', name: 'Ballet shoes', description: null, price_minor: 9000, currency: 'ILS', image_path: null,
  variants: [{ id: 'v3', label: '30', in_stock: false }],
};
const net: PublicCatalogueItem = {
  id: 'p3', name: 'Hair net', description: null, price_minor: 1500, currency: 'ILS', image_path: null,
  variants: [{ id: 'v4', label: 'One size', in_stock: true }],
};

const show = () => renderInApp(<PublicShopPage />, { path: '/shop', extraRoutes: { '/login': <p>login page</p> } });

describe('PublicShopPage', () => {
  beforeEach(async () => {
    setTenant('dance');
    await setLanguage('en');
    state.items = [leotard, shoes, net];
    state.user = null;
    state.tenantIds = [];
  });

  it('shows the studio items with picture, price and sizes to anyone', async () => {
    show();
    expect(await screen.findByText('Black leotard')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Shop' })).toBeTruthy();
    expect((screen.getByAltText('Black leotard') as HTMLImageElement).src).toBe('https://cdn.test/t1/x.jpg');
    expect(screen.getByText('Cotton, long sleeves')).toBeTruthy();
    expect(screen.getByText(/Age 4-6 \(sold out\), Age 7-9/)).toBeTruthy();
    expect(screen.getByText('Hair net')).toBeTruthy();
    // A whole item sold out says so; "One size" is not listed as a size.
    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(screen.queryByText(/One size/)).toBeNull();
    expect(state.tenantIds[0]).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('asks visitors to sign in to order', async () => {
    show();
    const link = await screen.findByRole('link', { name: 'Sign in to order' });
    expect(link.getAttribute('href')).toBe('/login');
    expect(screen.getByText(/Everyone else can buy at the studio/)).toBeTruthy();
  });

  it('sends signed-in families to their page to order', async () => {
    state.user = { id: 'u1' };
    show();
    const link = await screen.findByRole('link', { name: 'Order from my page' });
    expect(link.getAttribute('href')).toBe('/dashboard');
  });

  it('says when nothing is on sale', async () => {
    state.items = [];
    show();
    expect(await screen.findByText('Nothing is on sale right now.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in to order' })).toBeNull();
  });

  it('reads in Hebrew', async () => {
    await setLanguage('he');
    show();
    expect(await screen.findByRole('link', { name: 'כניסה כדי להזמין' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'חנות' })).toBeTruthy();
  });
});
