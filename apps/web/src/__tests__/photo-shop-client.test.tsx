// @vitest-environment jsdom
/**
 * Photo shop in "My shoots" (beta): hidden without a gallery; included photos
 * first, then the price per photo; nothing about included photos when there
 * are none; bought photos can't be added again; paying opens /pay/:token;
 * "all photos" offered when it's no dearer than the cart; "In cash to the studio" sends
 * the order in without the pay page, and those photos stay with that order. EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ClientPhotoShop } from '@/features/jobs/components/ClientPhotoShop';
import type { ClientPhotoGallery, ClientPhotoShopView } from '@/features/jobs/services/clientPhotoShopService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  flag: true,
  gallery: null as ClientPhotoGallery | null,
  order: vi.fn(),
  payBy: [] as string[],
}));
vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:photo_shop', isLoading: false }),
}));
vi.mock('@/features/jobs/services/clientPhotoShopService', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/services/clientPhotoShopService')>();
  return {
    ...real,
    ClientPhotoShopService: {
      gallery: async () => state.gallery,
      order: (id: string, keys: string[], all: boolean, payBy = 'card') => {
        state.payBy.push(payBy);
        return state.order(id, keys, all);
      },
    },
  };
});

const photos = Array.from({ length: 6 }, (_, i) => ({
  key: `g-${i + 1}`,
  fileName: `IMG_000${i + 1}.jpg`,
  previewUrl: 'data:image/svg+xml,<svg/>',
}));

function view(over: Partial<ClientPhotoShopView> = {}): ClientPhotoShopView {
  return {
    engagement_id: 'e1',
    has_shop: true,
    open: true,
    closes_at: '2027-02-02T21:59:59Z',
    currency: 'ILS',
    included_photos: 2,
    included_left: 2,
    price_per_photo_minor: 3000,
    all_photos_price_minor: 10000,
    spent_minor: 0,
    bought_image_keys: [],
    awaiting_image_keys: [],
    orders: [],
    ...over,
  };
}

/** The cart line, whose total is in a <strong>. */
const cartLine = (re: RegExp) =>
  screen.getByText((_, el) => el?.tagName === 'P' && re.test(el.textContent ?? ''));

const addButtons = () => screen.getAllByRole('button', { name: 'Add to cart' });

describe('ClientPhotoShop', () => {
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.flag = true;
    state.gallery = { shop: view(), photos };
    state.payBy = [];
    state.order.mockReset().mockResolvedValue({ orderId: 'o1', status: 'awaiting_payment', totalMinor: 3000, currency: 'ILS', payToken: 'tok123' });
  });

  it('shows nothing without the flag or without a gallery', async () => {
    state.flag = false;
    const a = renderInApp(<ClientPhotoShop engagementId="e1" />);
    expect(a.container.textContent).not.toContain('Buy your photos');
    a.unmount();
    state.flag = true;
    state.gallery = null;
    const b = renderInApp(<ClientPhotoShop engagementId="e1" />);
    await waitFor(() => expect(b.container.textContent).not.toContain('Buy your photos'));
  });

  it('included photos first, then the price; Pay opens the pay page', async () => {
    renderInApp(<ClientPhotoShop engagementId="e1" />, {
      path: '/portal',
      extraRoutes: { '/pay/:token': <p>pay page</p> },
    });
    expect(await screen.findByText(/2 photos included in your package · ₪30(\.00)? per photo/)).toBeTruthy();
    fireEvent.click(addButtons()[0]);
    fireEvent.click(addButtons()[0]);
    expect(cartLine(/2 photos in your cart · 2 included · ₪0/)).toBeTruthy();
    fireEvent.click(addButtons()[0]);
    expect(cartLine(/3 photos in your cart · 2 included · ₪30/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Pay ₪30/ }));
    await waitFor(() => expect(state.order).toHaveBeenCalledWith('e1', ['g-1', 'g-2', 'g-3'], false));
    expect(await screen.findByTestId('location')).toHaveProperty('textContent', '/pay/tok123');
  });

  it('with 0 included says nothing about included photos', async () => {
    state.gallery = { shop: view({ included_photos: 0, included_left: 0 }), photos };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    await screen.findByText(/^₪30(\.00)? per photo/);
    fireEvent.click(addButtons()[0]);
    expect(cartLine(/1 photo in your cart · ₪30/)).toBeTruthy();
    expect(screen.queryByText(/included/)).toBeNull();
  });

  it('bought photos show Bought and cannot be added', async () => {
    state.gallery = { shop: view({ bought_image_keys: ['g-1'] }), photos };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    const tile = (await screen.findByAltText('Preview of IMG_0001.jpg')).closest('li')!;
    expect(within(tile).getByText('Bought')).toBeTruthy();
    expect(within(tile).queryByRole('button')).toBeNull();
    expect(addButtons()).toHaveLength(5);
  });

  it('offers all photos once it is no dearer than the cart', async () => {
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    await screen.findByText(/per photo/);
    for (let i = 0; i < 6; i++) fireEvent.click(addButtons()[0]);
    // 6 picked = all 6 remaining → no suggestion (nothing more to add).
    expect(screen.queryByText(/no more than your cart/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'In cart' })[0]);
    // 5 picked: 2 free + 3 × 30 = 90 < 100 → still no suggestion.
    expect(screen.queryByText(/no more than your cart/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Buy all 6 photos for ₪100/ }));
    await waitFor(() => expect(state.order).toHaveBeenCalledWith('e1', expect.any(Array), true));
  });

  it('free order: confirmation instead of the pay page', async () => {
    state.order.mockResolvedValue({ orderId: 'o2', status: 'paid', totalMinor: 0, currency: 'ILS', payToken: null });
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    await screen.findByText(/per photo/);
    fireEvent.click(addButtons()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Get these photos' }));
    expect(await screen.findByText('Done. The studio will send you a download link.')).toBeTruthy();
  });

  it('delivered orders link to the download, without the referrer', async () => {
    state.gallery = {
      shop: view({
        bought_image_keys: ['g-1'],
        orders: [{
          id: 'o1', status: 'delivered', photo_count: 1, included_count: 1, total_minor: 0, currency: 'ILS',
          created_at: '2026-11-04T10:00:00Z', paid_at: '2026-11-04T10:00:00Z', delivered_at: '2026-11-05T10:00:00Z',
          pay_token: null, delivery_url: 'https://studio.smugmug.test/dl',
        }],
      }),
      photos,
    };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    const link = await screen.findByRole('link', { name: 'Download your photos' });
    expect(link.getAttribute('href')).toBe('https://studio.smugmug.test/dl');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('an order the studio marked as sent says so, with no link', async () => {
    state.gallery = {
      shop: view({
        bought_image_keys: ['g-1'],
        orders: [{
          id: 'o1', status: 'delivered', photo_count: 1, included_count: 1, total_minor: 0, currency: 'ILS',
          created_at: '2026-11-04T10:00:00Z', paid_at: '2026-11-04T10:00:00Z', delivered_at: '2026-11-05T10:00:00Z',
          pay_token: null, delivery_url: null,
        }],
      }),
      photos,
    };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    expect(await screen.findByText('Sent to you by the studio')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Download your photos' })).toBeNull();
  });

  it('pay in cash: sends the order in, no pay page, and says what happens next', async () => {
    state.order.mockResolvedValue({
      orderId: 'o3', status: 'awaiting_payment', totalMinor: 3000, currency: 'ILS', payToken: 'tok9', payByCash: true,
    });
    renderInApp(<ClientPhotoShop engagementId="e1" />, { path: '/portal', extraRoutes: { '/pay/:token': <p>pay page</p> } });
    await screen.findByText(/per photo/);
    for (let i = 0; i < 3; i++) fireEvent.click(addButtons()[0]);
    expect((screen.getByLabelText('By card now') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('In cash to the studio'));
    fireEvent.click(screen.getByRole('button', { name: /^Send order \(₪30(\.00)? in cash\)/ }));
    await waitFor(() => expect(state.order).toHaveBeenCalledWith('e1', ['g-1', 'g-2', 'g-3'], false));
    expect(state.payBy).toEqual(['cash']);
    expect(await screen.findByText(/Order sent. Pay the studio in cash/)).toBeTruthy();
    expect(screen.queryByText('pay page')).toBeNull();
  });

  it('photos sent in to pay in cash stay with that order; the order offers card instead', async () => {
    state.gallery = {
      shop: view({
        awaiting_image_keys: ['g-1'],
        cash_image_keys: ['g-1'],
        orders: [{
          id: 'o3', status: 'awaiting_payment', photo_count: 1, included_count: 0, total_minor: 3000, currency: 'ILS',
          created_at: '2026-11-11T10:00:00Z', paid_at: null, delivered_at: null, pay_token: 'tok9', delivery_url: null,
          pay_by_cash: true,
        }],
      }),
      photos,
    };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    const tile = (await screen.findByAltText('Preview of IMG_0001.jpg')).closest('li')!;
    expect(within(tile).getByText('Ordered, paying in cash')).toBeTruthy();
    expect(within(tile).queryByRole('button')).toBeNull();
    expect(screen.getByText(/Sent in, paying in cash/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pay by card instead' }).getAttribute('href')).toBe('/pay/tok9');
  });

  it('has Hebrew text and the sale note', async () => {
    await setLanguage('he');
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    expect(await screen.findByText('קניית התמונות שלך')).toBeTruthy();
    expect(screen.getByText(/התמונות נמכרות כקבצים להורדה/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'הוספה לסל' })).toHaveLength(6);
  });
});
