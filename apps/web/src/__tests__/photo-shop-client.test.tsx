// @vitest-environment jsdom
/**
 * Photo shop in "My shoots" (beta): hidden without a gallery; included photos
 * first, then the price per photo; nothing about included photos when there
 * are none; bought photos can't be added again; paying opens /pay/:token;
 * "all photos" offered when it's no dearer than the cart; "Pay the studio directly" sends
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
  products: [] as unknown[],
  galleryCall: (_id: string, _refresh?: boolean) => undefined as void,
}));
vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:photo_shop', isLoading: false }),
}));
vi.mock('@/features/jobs/services/clientPhotoShopService', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/services/clientPhotoShopService')>();
  return {
    ...real,
    ClientPhotoShopService: {
      gallery: async (id: string, refresh = false) => {
        state.galleryCall(id, refresh);
        return state.gallery;
      },
      order: (id: string, keys: string[], all: boolean, payBy = 'card', products: unknown[] = []) => {
        state.payBy.push(payBy);
        state.products = products;
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
    card_payments: true,
    orders: [],
    ...over,
  };
}

/** The cart line, whose total is in a <strong>. */
const cartLine = (re: RegExp) =>
  screen.getByText((_, el) => el?.tagName === 'P' && re.test(el.textContent ?? ''));

const addButtons = () => screen.getAllByRole('button', { name: 'Choose' });

describe('ClientPhotoShop: prints and other products', () => {
  const products = [
    { id: 'p-canvas', name_en: 'Canvas print', name_he: 'הדפסה על קנבס', size: '20x30 cm', price_minor: 14000 },
    { id: 'p-wood', name_en: 'Wood print', name_he: 'הדפסה על עץ', size: '30x45 cm', price_minor: 23000 },
  ];
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.flag = true;
    state.payBy = [];
    state.products = [];
    state.order.mockReset().mockResolvedValue({ orderId: 'o1', status: 'awaiting_payment', totalMinor: 14000, currency: 'ILS', payToken: 'tok', payByCash: true });
  });

  it('tapping a photo opens its buying options: digital, prints with how many, next photo', async () => {
    state.gallery = {
      shop: view({ included_photos: 1, included_left: 1, price_per_photo_minor: 7500, products, bought_image_keys: ['g-2'] }),
      photos,
    };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    // The grid keeps the quick digital button.
    expect((await screen.findAllByRole('button', { name: /^Digital ₪75/ })).length).toBe(5);

    fireEvent.click(screen.getByRole('button', { name: 'Open IMG_0001.jpg to see the ways to buy it' }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Buy this photo')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Canvas print · 20x30 cm' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Canvas print · 20x30 cm' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Wood print · 30x45 cm' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Add' }));
    // 1 digital (included, free) + 2 × 140 + 230.
    expect(within(panel).getByText('1 photo in your cart · 3 prints · ₪510')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove one Canvas print · 20x30 cm' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove one Wood print · 30x45 cm' }));
    expect(within(panel).getByText('1 photo in your cart · 1 print · ₪140')).toBeTruthy();

    // Next photo: already bought, but it can still be printed.
    fireEvent.click(within(panel).getByRole('button', { name: 'Next' }));
    expect(within(panel).getByText('Bought')).toBeTruthy();
    expect(within(panel).getByText(/IMG_0002\.jpg · 2\/6/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(screen.getByRole('button', { name: '1 print chosen' })).toBeTruthy();
    expect(cartLine(/1 photo in your cart · 1 print · 1 included · ₪140/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Send order \(₪140/ }));
    await waitFor(() => expect(state.order).toHaveBeenCalledWith('e1', ['g-1'], false));
    expect(state.payBy).toEqual(['cash']);
    expect(state.products).toEqual([{ imageKey: 'g-1', productId: 'p-canvas' }]);
  });

  it('a print alone is an order', async () => {
    state.gallery = { shop: view({ included_photos: 0, included_left: 0, products }), photos };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Prints and sizes' }))[2]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Add Wood print · 30x45 cm' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cartLine(/0 photos in your cart · 1 print · ₪230/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Send order \(₪230/ }));
    await waitFor(() => expect(state.order).toHaveBeenCalledWith('e1', [], false));
    expect(state.products).toEqual([{ imageKey: 'g-3', productId: 'p-wood' }]);
  });

  it('without products the shop looks as before', async () => {
    state.gallery = { shop: view(), photos };
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    await screen.findAllByRole('button', { name: 'Choose' });
    expect(screen.queryByText('Prints and sizes')).toBeNull();
    expect(screen.queryByRole('button', { name: /to see the ways to buy it/ })).toBeNull();
  });
});

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
    fireEvent.click(screen.getByLabelText('By card now'));
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

  it('when no photo loads, says so instead of showing an empty shop', async () => {
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    const gallery = vi.spyOn(state, 'galleryCall');
    (await screen.findAllByRole('img')).forEach((img) => fireEvent.error(img));
    // First: fresh links are asked for once, and the shop shows again.
    await waitFor(() => expect(gallery).toHaveBeenLastCalledWith('e1', true));
    expect(screen.queryByText(/The photos can't be shown right now/)).toBeNull();
    // Those don't load either: the client is told, instead of an empty shop.
    (await screen.findAllByRole('img')).forEach((img) => fireEvent.error(img));
    expect(await screen.findByText(/The photos can't be shown right now/)).toBeTruthy();
    expect(gallery.mock.calls.filter(([, refresh]) => refresh)).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: 'Choose' })).toHaveLength(0);
  });

  it('offers all photos once it is no dearer than the cart', async () => {
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    await screen.findByText(/per photo/);
    for (let i = 0; i < 6; i++) fireEvent.click(addButtons()[0]);
    // 6 picked = all 6 remaining → no suggestion (nothing more to add).
    expect(screen.queryByText(/no more than your cart/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Chosen ✓' })[0]);
    // 5 picked: 2 free + 3 × 30 = 90 < 100 → still no suggestion.
    expect(screen.queryByText(/no more than your cart/)).toBeNull();
    fireEvent.click(screen.getByLabelText('By card now'));
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

  it('card payments off: no card choice, the order is sent in to pay the studio', async () => {
    state.gallery = { shop: view({ card_payments: false }), photos };
    state.order.mockResolvedValue({
      orderId: 'o4', status: 'awaiting_payment', totalMinor: 3000, currency: 'ILS', payToken: 'tok8', payByCash: true,
    });
    renderInApp(<ClientPhotoShop engagementId="e1" />, { path: '/portal', extraRoutes: { '/pay/:token': <p>pay page</p> } });
    await screen.findByText(/per photo/);
    for (let i = 0; i < 3; i++) fireEvent.click(addButtons()[0]);
    expect(screen.queryByLabelText('By card now')).toBeNull();
    expect(screen.getByText('You pay the studio directly (cash, bank transfer or other).')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Send order \(₪30(\.00)?, pay the studio\)/ }));
    await waitFor(() => expect(state.order).toHaveBeenCalled());
    expect(state.payBy).toEqual(['cash']);
    expect(screen.queryByText('pay page')).toBeNull();
  });

  it('pay in cash: sends the order in, no pay page, and says what happens next', async () => {
    state.order.mockResolvedValue({
      orderId: 'o3', status: 'awaiting_payment', totalMinor: 3000, currency: 'ILS', payToken: 'tok9', payByCash: true,
    });
    renderInApp(<ClientPhotoShop engagementId="e1" />, { path: '/portal', extraRoutes: { '/pay/:token': <p>pay page</p> } });
    await screen.findByText(/per photo/);
    for (let i = 0; i < 3; i++) fireEvent.click(addButtons()[0]);
    // Paying the studio directly is chosen first.
    expect((screen.getByLabelText('Pay the studio directly (cash, bank transfer or other)') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('By card now') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^Send order \(₪30(\.00)?, pay the studio\)/ }));
    await waitFor(() => expect(state.order).toHaveBeenCalledWith('e1', ['g-1', 'g-2', 'g-3'], false));
    expect(state.payBy).toEqual(['cash']);
    expect(await screen.findByText(/Order sent. Pay the studio directly/)).toBeTruthy();
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
    expect(within(tile).getByText('Ordered, paying the studio directly')).toBeTruthy();
    expect(within(tile).queryByRole('button')).toBeNull();
    expect(screen.getByText(/Sent in, paying the studio directly/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pay by card instead' }).getAttribute('href')).toBe('/pay/tok9');
  });

  it('has Hebrew text and the sale note', async () => {
    await setLanguage('he');
    renderInApp(<ClientPhotoShop engagementId="e1" />);
    expect(await screen.findByText('קניית התמונות שלך')).toBeTruthy();
    expect(screen.getByText(/התמונות נמכרות כקבצים להורדה/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'לבחירה' })).toHaveLength(6);
  });
});
