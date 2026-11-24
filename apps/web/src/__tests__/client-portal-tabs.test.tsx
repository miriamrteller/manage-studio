// @vitest-environment jsdom
/**
 * Client page tabs: with the photo shop feature on and a shoot's gallery open, the page
 * opens on a Photo shop tab holding only the shop; everything else is on its own tab.
 * Shop feature off, or no gallery open yet: no Photo shop tab, the page opens on My shoots.
 * ?tab= picks a tab. EN + HE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ClientPortal } from '@/features/jobs/components/ClientPortal';
import type { ClientPortalData } from '@/features/jobs/hooks/useClientPortal';
import type { ClientPhotoGallery } from '@/features/jobs/services/clientPhotoShopService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/hooks/useAuth', () => ({
  useAuthSession: () => ({ session: { user: { id: 'user-1' } }, isLoading: false }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { id: 'user-1', email: 'client@example.com', role: ['account_holder'], person_id: null },
    isLoading: false,
    isProfileChecked: true,
  }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
  },
}));

const state = vi.hoisted(() => ({
  flag: true,
  gallery: null as ClientPhotoGallery | null,
  data: null as ClientPortalData | null,
}));
vi.mock('@/hooks/useFeatureGate', () => ({
  useFeatureGate: () => ({ hasFeature: (k: string) => state.flag && k === 'billing:photo_shop', isLoading: false }),
}));
vi.mock('@/features/jobs/hooks/useClientPortal', async (orig) => ({
  ...(await orig<object>()),
  useClientPortal: () => ({ data: state.data, isLoading: false, error: null }),
}));
vi.mock('@/features/jobs/services/clientPhotoShopService', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/services/clientPhotoShopService')>();
  return { ...real, ClientPhotoShopService: { gallery: async () => state.gallery } };
});
vi.mock('@/features/jobs/components/ClientJobGalleryCard', () => ({
  ClientJobGalleryCard: () => <p>GALLERY CARD</p>,
}));
vi.mock('@/components/legal/PersonConsentPanel', () => ({ PersonConsentPanel: () => <p>CONSENT</p> }));
vi.mock('@/features/notifications/hooks/useContactPreferences', () => ({
  useContactPreferences: () => ({ preferences: null, isLoading: false }),
}));

function data(): ClientPortalData {
  return {
    self: { personId: 'p1', accountId: 'a1', name: 'Pat Client', email: 'pat@example.com' },
    shoots: [
      {
        engagementId: 'e1',
        personId: 'p1',
        jobStatus: 'delivered',
        location: 'Jaffa Port',
        galleryReleased: true,
        bookedStartsAt: '2026-10-01T10:00:00.000Z',
        bookedEndsAt: null,
        engagementStatus: 'active',
        packageName: 'Wedding Gold',
        contractSigned: true,
      },
    ],
    requests: [],
    bookings: [],
  } as ClientPortalData;
}

function gallery(): ClientPhotoGallery {
  return {
    shop: {
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
    },
    photos: [{ key: 'g-1', fileName: 'IMG_0001.jpg', previewUrl: 'data:image/svg+xml,<svg/>' }],
  } as ClientPhotoGallery;
}

describe('ClientPortal tabs', () => {
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.flag = true;
    state.gallery = gallery();
    state.data = data();
  });

  it('opens on the Photo shop tab, with only the shop on it', async () => {
    renderInApp(<ClientPortal />, { path: '/dashboard/portal' });
    const shopTab = await screen.findByRole('tab', { name: 'Photo shop' });
    expect(shopTab).toHaveAttribute('aria-selected', 'true');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Photo shop', 'My shoots', 'Payments', 'Gallery', 'My details']);

    const panel = screen.getByRole('tabpanel');
    expect(await screen.findByText('Buy your photos')).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/Jaffa Port|Contract|No payments|GALLERY CARD|Pat Client|CONSENT/);

    fireEvent.click(screen.getByRole('tab', { name: 'My shoots' }));
    expect(screen.getByText('Jaffa Port')).toBeInTheDocument();
    expect(screen.queryByText('Buy your photos')).toBeNull();
  });

  it('no gallery open yet: no Photo shop tab, opens on My shoots', async () => {
    state.gallery = null;
    renderInApp(<ClientPortal />, { path: '/dashboard/portal' });
    expect(await screen.findByRole('tab', { name: 'My shoots' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Photo shop' })).toBeNull();
  });

  it('photo shop feature off: no Photo shop tab', async () => {
    state.flag = false;
    renderInApp(<ClientPortal />, { path: '/dashboard/portal' });
    expect(await screen.findByRole('tab', { name: 'My shoots' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Photo shop' })).toBeNull();
  });

  it('?tab= opens that tab', async () => {
    renderInApp(<ClientPortal />, { path: '/dashboard/portal', initialEntry: '/dashboard/portal?tab=details' });
    expect(await screen.findByRole('tab', { name: 'My details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Pat Client')).toBeInTheDocument();
  });

  it('money still to pay shows above the tabs, with Pay', async () => {
    state.gallery = null;
    state.data = {
      ...data(),
      requests: [
        { id: 'r1', engagement_id: 'e1', label: 'Balance', amount_minor: 140000, currency: 'ILS', status: 'sent', due_date: '2026-11-20', public_token: 'tok' },
        { id: 'r2', engagement_id: 'e1', label: 'Deposit', amount_minor: 60000, currency: 'ILS', status: 'paid', due_date: null, public_token: 'tok2' },
      ],
    } as unknown as ClientPortalData;
    renderInApp(<ClientPortal />, { path: '/dashboard/portal' });
    expect(await screen.findByText(/1,400 still to pay/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Pay' }).length).toBeGreaterThan(0);
  });

  it('nothing to pay: no notice', async () => {
    state.gallery = null;
    renderInApp(<ClientPortal />, { path: '/dashboard/portal' });
    await screen.findByRole('tab', { name: 'My shoots' });
    expect(screen.queryByText(/still to pay/)).toBeNull();
  });

  it('Hebrew tab names', async () => {
    await setLanguage('he');
    renderInApp(<ClientPortal />, { path: '/dashboard/portal' });
    expect(await screen.findByRole('tab', { name: 'חנות תמונות' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'תשלומים' })).toBeInTheDocument();
  });
});
