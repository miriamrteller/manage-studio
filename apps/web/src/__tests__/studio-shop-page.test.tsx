// @vitest-environment jsdom
/**
 * Studio shop (beta), studio side: only with the feature; items list with price, sizes and
 * stock; adding an item sends its sizes in order (empty stock = not counted); "One size"
 * is prefilled; a hidden item says so. EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import StudioShopPage from '@/pages/StudioShopPage';
import { navigationConfig } from '@/components/Navigation/navigationConfig';
import type { ShopProduct, ShopProductInput } from '@/features/shop/services/studioShopService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  flag: true,
  products: [] as ShopProduct[],
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:studio_shop', isLoading: false }),
}));
vi.mock('@/features/shop/services/studioShopService', async (orig) => {
  const real = await orig<typeof import('@/features/shop/services/studioShopService')>();
  return {
    ...real,
    StudioShopService: {
      ...real.StudioShopService,
      listProducts: async () => state.products,
      saveProduct: (input: ShopProductInput) => state.save(input),
      deleteProduct: (id: string) => state.remove(id),
      imageUrl: (path: string) => `https://cdn.test/${path}`,
      removeImage: async () => undefined,
    },
  };
});

const leotard: ShopProduct = {
  id: 'p1',
  name: 'Black leotard',
  description: null,
  price_minor: 12000,
  currency: 'ILS',
  image_path: 't1/x.jpg',
  active: true,
  variants: [
    { id: 'v1', label: 'Age 4-6', stock: 3 },
    { id: 'v2', label: 'Age 7-9', stock: 0 },
    { id: 'v3', label: 'Adult', stock: null },
  ],
};

describe('StudioShopPage', () => {
  beforeEach(async () => {
    setTenant('dance');
    await setLanguage('en');
    state.flag = true;
    state.products = [];
    state.save.mockReset().mockResolvedValue('p2');
    state.remove.mockReset().mockResolvedValue(undefined);
  });

  it('is in the menu for studio admins of class studios with the feature', () => {
    const item = navigationConfig.find((i) => i.path === '/admin/shop');
    expect(item?.featureKey).toBe('billing:studio_shop');
    expect(item?.needs).toBe('teaches_classes');
    expect(item?.requiredRoles).toEqual(['tenant_admin']);
  });

  it('sends a studio without the feature away', () => {
    state.flag = false;
    renderInApp(<StudioShopPage />, { path: '/admin/shop', extraRoutes: { '/admin/setup': <p>setup home</p> } });
    expect(screen.getByText('setup home')).toBeTruthy();
  });

  it('lists items with price, sizes and stock', async () => {
    state.products = [leotard, { ...leotard, id: 'p9', name: 'Old tights', active: false, image_path: null }];
    renderInApp(<StudioShopPage />, { path: '/admin/shop' });
    expect(await screen.findByText('Black leotard')).toBeTruthy();
    expect(screen.getAllByText('Age 4-6 (3 left) · Age 7-9 (sold out) · Adult')).toHaveLength(2);
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect((screen.getByAltText('Black leotard') as HTMLImageElement).src).toBe('https://cdn.test/t1/x.jpg');
  });

  it('adds an item with sizes in order; empty stock is not counted', async () => {
    renderInApp(<StudioShopPage />, { path: '/admin/shop' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    expect((screen.getByLabelText('Size') as HTMLInputElement).value).toBe('One size');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ballet shoes' } });
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: '85' } });
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText('In stock'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add size' }));
    fireEvent.change(screen.getAllByLabelText('Size')[1], { target: { value: '29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][0]).toMatchObject({
      name: 'Ballet shoes',
      price_minor: 8500,
      active: true,
      image_path: null,
      variants: [{ label: '28', stock: 4 }, { label: '29', stock: null }],
    });
  });

  it('Save stays off until the item has a name and a price', async () => {
    renderInApp(<StudioShopPage />, { path: '/admin/shop' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tights' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: '30' } });
    expect(save.disabled).toBe(false);
  });

  it('has Hebrew text', async () => {
    await setLanguage('he');
    state.products = [leotard];
    renderInApp(<StudioShopPage />, { path: '/admin/shop' });
    expect(await screen.findByRole('heading', { name: 'חנות' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'הוספת פריט' })).toBeTruthy();
    expect(screen.getByText(/Age 7-9 \(אזל\)/)).toBeTruthy();
  });
});
