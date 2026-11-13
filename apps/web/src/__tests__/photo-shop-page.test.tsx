// @vitest-environment jsdom
/**
 * Photo shop menu page (beta): only with the photo shop feature; Overview shows what's
 * left to set up; Preview shows a shoot's shop exactly as its client sees it (photos can
 * be picked and the buttons pressed, but no order is placed), opens on the shoot named
 * in the address, and has a sample-photos note; a shoot without a saved shop says so. EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import PhotoShopPage from '@/pages/PhotoShopPage';
import type { ClientPhotoShopView } from '@/features/jobs/services/clientPhotoShopService';
import { navigationConfig } from '@/components/Navigation/navigationConfig';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  flag: true,
  connected: false,
  pricePerPhoto: null as number | null,
  preview: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:photo_shop', isLoading: false }),
}));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobs: () => ({
    jobs: [
      { engagement_id: 'e1', job_status: 'booked', client_name: 'Client A', package_name: 'Family', booked_starts_at: '2026-11-20T10:00:00Z' },
      { engagement_id: 'e2', job_status: 'booked', client_name: 'Client B', package_name: 'Newborn', booked_starts_at: null },
    ],
    isLoading: false,
  }),
}));
vi.mock('@/features/jobs/hooks/usePhotoShop', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/hooks/usePhotoShop')>();
  return {
    ...real,
    usePhotoShopEnabled: () => state.flag,
    useStudioPhotoShopDefaults: () => ({
      defaults: { data: { price_per_photo_minor: state.pricePerPhoto, all_photos_price_minor: null, gallery_open_days: 90 }, isLoading: false },
      save: { mutate: vi.fn(), isPending: false, error: null },
    }),
  };
});
vi.mock('@/features/settings/services/smugmugService', async (orig) => {
  const real = await orig<typeof import('@/features/settings/services/smugmugService')>();
  return {
    ...real,
    SmugMugService: {
      ...real.SmugMugService,
      getStatus: async () => ({ hasKeys: state.connected, connected: state.connected, keysUpdatedAt: null, connectedAt: null }),
    },
  };
});
vi.mock('@/features/jobs/services/clientPhotoShopService', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/services/clientPhotoShopService')>();
  return { ...real, ClientPhotoShopService: { ...real.ClientPhotoShopService, preview: (id: string) => state.preview(id), order: (...a: unknown[]) => state.order(...a) } };
});

const view = (): ClientPhotoShopView => ({
  engagement_id: 'e1',
  has_shop: true,
  open: true,
  closes_at: '2027-02-02T21:59:59Z',
  currency: 'ILS',
  included_photos: 0,
  included_left: 0,
  price_per_photo_minor: 3000,
  all_photos_price_minor: null,
  spent_minor: 0,
  bought_image_keys: [],
  awaiting_image_keys: [],
  orders: [],
});
const photos = [1, 2, 3].map((i) => ({ key: `k${i}`, fileName: `IMG_000${i}.jpg`, previewUrl: 'data:image/svg+xml,<svg/>' }));

describe('Photo shop page', () => {
  beforeEach(async () => {
    state.flag = true;
    state.connected = false;
    state.pricePerPhoto = null;
    state.preview.mockReset();
    state.order.mockReset();
    setTenant('photographer');
    await setLanguage('en');
  });

  it('is a menu item only with the photo shop feature', () => {
    const item = navigationConfig.find((i) => i.path === '/admin/photo-shop');
    expect(item?.featureKey).toBe('billing:photo_shop');
    expect(item?.requiredRoles).toEqual(['tenant_admin']);
  });

  it('sends a studio without the feature away', () => {
    state.flag = false;
    renderInApp(<PhotoShopPage />, { path: '/admin/photo-shop', extraRoutes: { '/admin/setup': <p>setup home</p> } });
    expect(screen.getByText('setup home')).toBeTruthy();
  });

  it('Overview shows what is left, with links to the tabs', async () => {
    state.pricePerPhoto = 3000;
    renderInApp(<PhotoShopPage />, { path: '/admin/photo-shop' });
    expect(screen.getByRole('heading', { name: 'Photo shop' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'Prices', 'SmugMug', 'Preview']);
    expect(screen.getByText('Set your price per photo').parentElement?.textContent).toContain('Done');
    expect(screen.getByText(/Add each shoot's photos on its shoot page/)).toBeTruthy();
    expect(screen.queryByText('Connect your SmugMug account')).toBeNull();
  });

  it('Preview works like the client page but never places an order', async () => {
    state.preview.mockResolvedValue({ shop: view(), photos, sample: true });
    renderInApp(<PhotoShopPage />, { path: '/admin/photo-shop', initialEntry: '/admin/photo-shop?tab=preview' });
    fireEvent.change(screen.getByLabelText('Shoot'), { target: { value: 'e1' } });
    expect(await screen.findByText(/this is exactly what your client sees/i)).toBeTruthy();
    expect(screen.getByText(/sample photos until you add this shoot's photos/)).toBeTruthy();
    expect(state.preview).toHaveBeenCalledWith('e1');
    expect(screen.getByText('IMG_0001.jpg')).toBeTruthy();

    // Card: picking photos and pressing Pay shows what would happen, nothing is ordered.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add to cart' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Pay/ }));
    expect(screen.getByText(/nothing was ordered or charged/).textContent).toMatch(/secure payment page/);

    // Cash: the client's own confirmation is shown, still nothing ordered.
    fireEvent.click(screen.getByLabelText('In cash to the studio'));
    expect(screen.queryByText(/nothing was ordered/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Send order/ }));
    expect(screen.getByText(/nothing was ordered or charged/).textContent).toMatch(/Pay the studio in cash/);
    expect(state.order).not.toHaveBeenCalled();
  });

  it('Preview opens on the shoot named in the address', async () => {
    state.preview.mockResolvedValue({ shop: view(), photos, sample: false });
    renderInApp(<PhotoShopPage />, { path: '/admin/photo-shop', initialEntry: '/admin/photo-shop?tab=preview&shoot=e1' });
    expect(await screen.findByText('IMG_0002.jpg')).toBeTruthy();
    expect(state.preview).toHaveBeenCalledWith('e1');
    expect((screen.getByLabelText('Shoot') as HTMLSelectElement).value).toBe('e1');
  });

  it('Preview says when a shoot has no shop yet', async () => {
    const { ClientPhotoShopError } = await import('@/features/jobs/services/clientPhotoShopService');
    state.preview.mockRejectedValue(new ClientPhotoShopError('no_shop'));
    renderInApp(<PhotoShopPage />, { path: '/admin/photo-shop', initialEntry: '/admin/photo-shop?tab=preview' });
    fireEvent.change(screen.getByLabelText('Shoot'), { target: { value: 'e2' } });
    expect(await screen.findByText(/This shoot has no photos yet/)).toBeTruthy();
  });

  it('has Hebrew text', async () => {
    await setLanguage('he');
    renderInApp(<PhotoShopPage />, { path: '/admin/photo-shop' });
    expect(screen.getByRole('heading', { name: 'חנות תמונות' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'תצוגה מקדימה' })).toBeTruthy();
  });
});
