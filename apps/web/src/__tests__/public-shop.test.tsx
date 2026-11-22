// @vitest-environment jsdom
/**
 * Studio shop (beta), public page /shop (owner, 22 Nov 2026): anyone sees the items with
 * picture, price and sizes (sold-out sizes can't be picked, stock counts never shown), adds
 * them to a cart and orders with name and email (prefilled when known). Card goes to the
 * usual pay page; "Pay the studio directly" sends the order in. Collect at the studio. EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import PublicShopPage from '@/pages/PublicShopPage';
import type { GuestCheckoutInput, PublicCatalogueItem } from '@/features/shop/services/shopOrdersService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  items: [] as PublicCatalogueItem[],
  known: { name: '', email: '', phone: '' },
  tenantIds: [] as string[],
  checkout: vi.fn(),
}));

vi.mock('@/hooks/useSignedInPrefill', async (orig) => {
  const real = await orig<typeof import('@/hooks/useSignedInPrefill')>();
  return { ...real, useSignedInPrefill: () => state.known };
});
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
      guestCheckout: (input: GuestCheckoutInput) => state.checkout(input),
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

const show = () => renderInApp(<PublicShopPage />, { path: '/shop', extraRoutes: { '/pay/:token': <p>pay page</p> } });

const fill = () => {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Buyer' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.test' } });
};

describe('PublicShopPage', () => {
  beforeEach(async () => {
    setTenant('dance');
    await setLanguage('en');
    state.items = [leotard, shoes, net];
    state.known = { name: '', email: '', phone: '' };
    state.tenantIds = [];
    state.checkout.mockReset().mockResolvedValue({ orderId: 'o1', payToken: 'tok' });
  });

  it('shows the items with picture, price and sizes; sold-out sizes cannot be picked', async () => {
    show();
    expect(await screen.findByText('Black leotard')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Shop' })).toBeTruthy();
    expect((screen.getByAltText('Black leotard') as HTMLImageElement).src).toBe('https://cdn.test/t1/x.jpg');
    expect(screen.getByText('Cotton, long sleeves')).toBeTruthy();
    const size = screen.getByLabelText('Size') as HTMLSelectElement;
    expect(size.value).toBe('v2');
    expect((within(size).getByText('Age 4-6 (sold out)') as HTMLOptionElement).disabled).toBe(true);
    // A whole item sold out says so and has no Add button.
    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Ballet shoes to cart' })).toBeNull();
    expect(state.tenantIds[0]).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('orders by card: cart, details, then the pay page', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Black leotard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Black leotard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Hair net to cart' }));
    const cart = screen.getByLabelText('Your cart');
    expect(cart.textContent).toContain('Black leotard · Age 7-9 ×2');
    expect(cart.textContent).toMatch(/Total: ₪\s?255/);
    expect(cart.textContent).toContain('kept for you for 48 hours');
    expect(cart.textContent).toContain('collect your order at the studio');
    expect((screen.getByRole('button', { name: 'Go to payment' }) as HTMLButtonElement).disabled).toBe(true);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Go to payment' }));
    expect(await screen.findByText('pay page')).toBeTruthy();
    const input = state.checkout.mock.calls[0][0] as GuestCheckoutInput;
    expect(input).toMatchObject({
      name: 'Test Buyer',
      email: 'buyer@example.test',
      payBy: 'card',
      website: '',
      lines: [{ variantId: 'v2', quantity: 2 }, { variantId: 'v4', quantity: 1 }],
    });
    expect(input.subdomain).toBeTruthy();
  });

  it('pays the studio directly: the order is sent in and the page says how to pay', async () => {
    state.checkout.mockResolvedValue({ orderId: 'o2', payToken: null });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Hair net to cart' }));
    fill();
    fireEvent.click(screen.getByLabelText('Pay the studio directly (cash, bank transfer or other)'));
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Thank you, your order is in')).toBeTruthy();
    expect(screen.getByText(/Pay the studio directly by cash, bank transfer/)).toBeTruthy();
    expect((state.checkout.mock.calls[0][0] as GuestCheckoutInput).payBy).toBe('studio');
  });

  it('prefills what we know about a signed-in visitor', async () => {
    state.known = { name: 'Known Parent', email: 'known@example.test', phone: '050-0000000' };
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Hair net to cart' }));
    await waitFor(() => expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe('Known Parent'));
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('known@example.test');
    expect((screen.getByLabelText('Phone (optional)') as HTMLInputElement).value).toBe('050-0000000');
  });

  it('says when a size sold out meanwhile', async () => {
    state.checkout.mockRejectedValue(new Error('place_shop_order: sold_out'));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Hair net to cart' }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Go to payment' }));
    expect((await screen.findByRole('alert')).textContent).toContain('sold out just now');
  });

  it('says when nothing is on sale', async () => {
    state.items = [];
    show();
    expect(await screen.findByText('Nothing is on sale right now.')).toBeTruthy();
  });

  it('reads in Hebrew', async () => {
    await setLanguage('he');
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'הוספת Hair net לסל' }));
    expect(screen.getByRole('heading', { level: 1, name: 'חנות' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'מעבר לתשלום' })).toBeTruthy();
    expect(screen.getByLabelText('תשלום ישירות לסטודיו (מזומן, העברה בנקאית או דרך אחרת)')).toBeTruthy();
  });
});
