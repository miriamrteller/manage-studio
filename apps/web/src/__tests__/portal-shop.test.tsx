// @vitest-environment jsdom
/**
 * Studio shop (beta), families' side: only with the feature; items with sizes (sold-out sizes
 * can't be picked); the cart is for the enrolled child by default and goes to the usual pay
 * page; orders show where they are, with Pay now and Cancel while unpaid; without an active
 * enrolment ordering waits (and says why). EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { PortalShop, type ShopPerson } from '@/features/shop/components/PortalShop';
import type { CatalogueItem, ShopOrder } from '@/features/shop/services/shopOrdersService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  flag: true,
  items: [] as CatalogueItem[],
  orders: [] as ShopOrder[],
  place: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:studio_shop', isLoading: false }),
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
      catalogue: async () => state.items,
      myOrders: async () => state.orders,
      placeOrder: (lines: unknown, personId: string | null) => state.place(lines, personId),
      cancelOrder: (id: string) => state.cancel(id),
    },
  };
});

const leotard: CatalogueItem = {
  id: 'p1',
  name: 'Black leotard',
  description: 'Cotton, long sleeves',
  price_minor: 12000,
  currency: 'ILS',
  image_path: 't1/x.jpg',
  variants: [
    { id: 'v1', label: 'Age 4-6', stock: 0 },
    { id: 'v2', label: 'Age 7-9', stock: 3 },
  ],
};
const net: CatalogueItem = {
  id: 'p2', name: 'Hair net', description: null, price_minor: 1500, currency: 'ILS', image_path: null,
  variants: [{ id: 'v3', label: 'One size', stock: null }],
};

const family: ShopPerson[] = [
  { id: 'c1', name: 'Noa', enrolled: true },
  { id: 'g1', name: 'Dana', enrolled: false },
];

const show = (people = family) =>
  renderInApp(<PortalShop people={people} />, { path: '/dashboard/portal', extraRoutes: { '/pay/:token': <p>pay page</p> } });

describe('PortalShop', () => {
  beforeEach(async () => {
    setTenant('dance');
    await setLanguage('en');
    state.flag = true;
    state.items = [leotard, net];
    state.orders = [];
    state.place.mockReset().mockResolvedValue({ orderId: 'o1', payToken: 'tok' });
    state.cancel.mockReset().mockResolvedValue(undefined);
  });

  it('shows nothing without the feature', async () => {
    state.flag = false;
    show();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('heading', { name: 'Studio shop' })).toBeNull();
    expect(screen.queryByText('Black leotard')).toBeNull();
  });

  it('lists items with picture, price and sizes; sold-out sizes cannot be picked', async () => {
    show();
    expect(await screen.findByText('Black leotard')).toBeTruthy();
    expect((screen.getByAltText('Black leotard') as HTMLImageElement).src).toBe('https://cdn.test/t1/x.jpg');
    expect(screen.getByText('Cotton, long sleeves')).toBeTruthy();
    const size = screen.getByLabelText('Size') as HTMLSelectElement;
    expect(size.value).toBe('v2');
    expect((within(size).getByText('Age 4-6 (sold out)') as HTMLOptionElement).disabled).toBe(true);
  });

  it('orders for the enrolled child and goes to the pay page', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Black leotard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Black leotard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Hair net to cart' }));
    const cart = screen.getByLabelText('Your cart');
    expect(cart.textContent).toContain('Black leotard · Age 7-9 ×2');
    expect(cart.textContent).toContain('Hair net · One size');
    expect(cart.textContent).toContain('For Noa');
    expect(cart.textContent).toMatch(/Total: ₪\s?255/);
    fireEvent.click(screen.getByRole('button', { name: 'Go to payment' }));
    await waitFor(() =>
      expect(state.place).toHaveBeenCalledWith([{ variantId: 'v2', quantity: 2 }, { variantId: 'v3', quantity: 1 }], 'c1'),
    );
    expect(await screen.findByText('pay page')).toBeTruthy();
  });

  it('never adds more than are in stock', async () => {
    show();
    const qty = (await screen.findAllByLabelText('How many'))[0] as HTMLInputElement;
    fireEvent.change(qty, { target: { value: '9' } });
    expect(qty.value).toBe('3');
  });

  it('waits for an enrolment before ordering, and says why', async () => {
    show([{ id: 'g1', name: 'Dana', enrolled: false }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Hair net to cart' }));
    expect(screen.getByText(/ordering opens once someone in your family is enrolled/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Go to payment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows orders with where they are; an unpaid one can be paid or cancelled', async () => {
    state.items = [];
    state.orders = [
      {
        id: 'o1', person_id: 'c1', person_name: 'Noa', status: 'awaiting_payment', total_minor: 1500, currency: 'ILS',
        created_at: '2026-11-10T09:00:00Z', paid_at: null, ready_at: null, collected_at: null, refunded: false,
        pay_token: 'tok', lines: [{ product_name: 'Hair net', variant_label: 'One size', unit_price_minor: 1500, quantity: 1, image_path: null }],
      },
      {
        id: 'o2', person_id: 'c1', person_name: 'Noa', status: 'ready', total_minor: 12000, currency: 'ILS',
        created_at: '2026-11-09T09:00:00Z', paid_at: '2026-11-09T09:05:00Z', ready_at: '2026-11-10T09:00:00Z',
        collected_at: null, refunded: false, pay_token: null,
        lines: [{ product_name: 'Black leotard', variant_label: 'Age 7-9', unit_price_minor: 12000, quantity: 1, image_path: null }],
      },
    ];
    show();
    expect(await screen.findByText('Waiting for payment.')).toBeTruthy();
    expect(screen.getByText('Ready to collect at the studio.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pay now' }).getAttribute('href')).toBe('/pay/tok');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(state.cancel).toHaveBeenCalledWith('o1'));
  });

  it('has Hebrew text', async () => {
    await setLanguage('he');
    show();
    expect(await screen.findByRole('heading', { name: 'החנות של הסטודיו' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'הוספת Hair net לסל' }));
    expect(screen.getByText('עבור Noa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'מעבר לתשלום' })).toBeTruthy();
  });
});
