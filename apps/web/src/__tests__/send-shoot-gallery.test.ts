/**
 * "Send gallery" on shoots (owner, 18 Nov 2026): which shoots go, the email's photo shop
 * button, and the service sending many shoots. Run: pnpm -C apps/web test send-shoot-gallery
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  planGallerySend,
  type SendGalleryShoot,
} from '../../../../supabase/functions/_shared/photo-shop/send-gallery.ts';
import { renderPhotographerEmail } from '../../../../supabase/functions/_shared/photographer-emails/render.ts';
import en from '../../../../packages/shared/src/i18n/email-templates-en.json';
import he from '../../../../packages/shared/src/i18n/email-templates-he.json';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));

import { SEND_GALLERY_MAX, ShootGalleryService } from '@/features/jobs/services/shootGalleryService';

const checked = {
  provider: 'smugmug',
  gallery_key: 'abc',
  gallery_web_url: 'https://studio.smugmug.com/Pat',
  smugmug_checked_at: '2026-11-18T10:00:00Z',
  smugmug_check: { passed: true, album_key: 'abc' },
  smugmug_photos: [{ key: 'p1', fileName: 'a.jpg', previewUrl: 'https://photos.smugmug.com/a.jpg' }],
};

const base: SendGalleryShoot = {
  cancelled: false,
  clientEmail: 'client@example.com',
  galleryUrl: null,
  shop: null,
  hasUploads: false,
  shopFeature: true,
};

describe('planGallerySend', () => {
  it('a checked SmugMug gallery goes, with its web address and the shop', () => {
    expect(planGallerySend({ ...base, shop: checked })).toEqual({
      send: true,
      galleryUrl: 'https://studio.smugmug.com/Pat',
      withShop: true,
    });
  });

  it('a SmugMug gallery that has not passed Check gallery is skipped, even with a pasted link', () => {
    const unchecked = { ...checked, smugmug_check: { passed: false, album_key: 'abc' } };
    expect(planGallerySend({ ...base, shop: unchecked, galleryUrl: 'https://x.test/g' }))
      .toEqual({ send: false, reason: 'not_checked' });
  });

  it('a pasted gallery link goes without a shop', () => {
    expect(planGallerySend({ ...base, galleryUrl: 'https://pixies.test/g' }))
      .toEqual({ send: true, galleryUrl: 'https://pixies.test/g', withShop: false });
  });

  it('uploaded photos: the shop is the gallery', () => {
    expect(planGallerySend({ ...base, shop: { provider: 'upload', gallery_key: null }, hasUploads: true }))
      .toEqual({ send: true, galleryUrl: null, withShop: true });
  });

  it('no shop button without the photo shop feature', () => {
    expect(planGallerySend({ ...base, shop: checked, shopFeature: false }))
      .toEqual({ send: true, galleryUrl: 'https://studio.smugmug.com/Pat', withShop: false });
  });

  it('skips: cancelled, no email, nothing to send', () => {
    expect(planGallerySend({ ...base, cancelled: true, galleryUrl: 'https://x.test' }))
      .toEqual({ send: false, reason: 'cancelled' });
    expect(planGallerySend({ ...base, clientEmail: ' ', galleryUrl: 'https://x.test' }))
      .toEqual({ send: false, reason: 'no_email' });
    expect(planGallerySend({ ...base, shop: { provider: 'upload', gallery_key: null } }))
      .toEqual({ send: false, reason: 'no_gallery' });
    expect(planGallerySend({ ...base, galleryUrl: 'javascript:alert(1)' }))
      .toEqual({ send: false, reason: 'no_gallery' });
  });
});

describe('gallery-ready email with the photo shop button', () => {
  it.each([
    ['en', en.gallery_ready],
    ['he', he.gallery_ready],
  ] as const)('%s: the shop button sits above the closing line', (language, strings) => {
    const { html } = renderPhotographerEmail({
      key: 'gallery_ready',
      language,
      schoolName: 'Studio',
      primaryColor: '#2563eb',
      accentColor: '#dc2626',
      variables: {
        recipientName: 'Pat',
        galleryUrl: 'https://studio.smugmug.com/Pat',
        signInUrl: 'https://studio.opalswift.com/shop/token',
        signInBody: strings.shop_body.replace('{days}', '3'),
        signInCta: strings.shop_cta,
        signInBefore: strings.closing,
      },
    });
    expect(html).toContain('https://studio.smugmug.com/Pat');
    const shopAt = html.indexOf('https://studio.opalswift.com/shop/token');
    expect(shopAt).toBeGreaterThan(0);
    expect(shopAt).toBeLessThan(html.indexOf(strings.closing));
    expect(html).toContain(strings.shop_cta);
  });

  it('without a shop link the email is unchanged', () => {
    const { html } = renderPhotographerEmail({
      key: 'gallery_ready',
      language: 'en',
      schoolName: 'Studio',
      primaryColor: '#2563eb',
      accentColor: '#dc2626',
      variables: { recipientName: 'Pat', galleryUrl: 'https://studio.smugmug.com/Pat' },
    });
    expect(html).not.toContain(en.gallery_ready.shop_cta);
  });
});

describe('ShootGalleryService.send', () => {
  beforeEach(() => invoke.mockReset());

  it('sends many shoots in batches and adds up the counts', async () => {
    const ids = Array.from({ length: SEND_GALLERY_MAX + 2 }, (_, i) => `e${i}`);
    invoke.mockImplementation(async (_name: string, options?: { body: { engagementIds: string[] } }) => {
      const body = options?.body ?? { engagementIds: [] };
      return {
      data: {
        sent: body.engagementIds.length - 1,
        skipped: 1,
        failed: 0,
        results: body.engagementIds.map((engagementId, i) => ({ engagementId, outcome: i === 0 ? 'no_email' : 'sent' })),
      },
      error: null,
      };
    });
    const result = await ShootGalleryService.send(ids);
    const calls = invoke.mock.calls.filter((call) => call[0] === 'send-shoot-gallery');
    expect(calls.map((call) => call[1].body.engagementIds.length)).toEqual([SEND_GALLERY_MAX, 2]);
    expect(result.sent).toBe(SEND_GALLERY_MAX + 2 - 2);
    expect(result.skipped).toBe(2);
    expect(result.results).toHaveLength(SEND_GALLERY_MAX + 2);
  });

  it('throws when the function fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(ShootGalleryService.send(['e1'])).rejects.toThrow();
  });
});
