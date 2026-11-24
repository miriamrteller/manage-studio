// @vitest-environment jsdom
/**
 * The client page's gallery link (owner, 22 Nov 2026): the shoot's photo shop page when
 * it has one, else the studio's own gallery link, never SmugMug.
 * Run: pnpm -C apps/web test client-gallery-link
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { ClientJobGalleryCard } from '@/features/jobs/components/ClientJobGalleryCard';
import { isSmugMugUrl } from '@/features/jobs/lib/galleryUrl';
import { renderInApp, setLanguage } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
const state = vi.hoisted(() => ({ url: null as string | null, shopOpen: false }));
vi.mock('@/features/jobs/hooks/useJobPaymentRequests', () => ({
  useJobPaymentRequests: () => ({ requests: [], isLoading: false }),
  useJobGallery: () => ({
    gallery: { released: true, has_gallery: true, gallery_url: state.url, engagement_id: 'e1' },
    isLoading: false,
  }),
}));
vi.mock('@/features/jobs/hooks/useClientPhotoShopOpen', () => ({
  useClientPhotoShopOpen: () => ({ open: state.shopOpen, loading: false }),
}));

describe('client gallery link', () => {
  beforeEach(async () => {
    await setLanguage('en');
    state.url = null;
    state.shopOpen = false;
  });

  it('a shop: opens the shoot\'s photo shop page, even with a SmugMug address saved', () => {
    state.url = 'https://studio.smugmug.com/Pat';
    state.shopOpen = true;
    renderInApp(<ClientJobGalleryCard engagementId="e1" currency="ILS" mode="gallery" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/photos/e1');
  });

  it('no shop and only a SmugMug address: no link', () => {
    state.url = 'https://studio.smugmug.com/Pat';
    renderInApp(<ClientJobGalleryCard engagementId="e1" currency="ILS" mode="gallery" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('no shop, another gallery service: that link', () => {
    state.url = 'https://pixies.test/g';
    renderInApp(<ClientJobGalleryCard engagementId="e1" currency="ILS" mode="gallery" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://pixies.test/g');
  });

  it('isSmugMugUrl', () => {
    expect(isSmugMugUrl('https://studio.smugmug.com/x')).toBe(true);
    expect(isSmugMugUrl('https://notsmugmug.com/x')).toBe(false);
    expect(isSmugMugUrl('javascript:alert(1)')).toBe(false);
  });
});
