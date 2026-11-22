/**
 * "Send gallery" on shoots (owner, 18 Nov 2026): which shoots go, the email's photo shop
 * button, and the service sending many shoots. Run: pnpm -C apps/web test send-shoot-gallery
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanGalleryMessage,
  cleanPhotoAlt,
  galleryEmailPhotoUrl,
  GALLERY_MESSAGE_MAX,
  planGallerySend,
  type SendGalleryShoot,
} from '../../../../supabase/functions/_shared/photo-shop/send-gallery.ts';
import { renderPhotographerEmail } from '../../../../supabase/functions/_shared/photographer-emails/render.ts';
import en from '../../../../packages/shared/src/i18n/email-templates-en.json';
import he from '../../../../packages/shared/src/i18n/email-templates-he.json';

const invoke = vi.hoisted(() => vi.fn());
const logRows = vi.hoisted(() => ({ rows: [] as Array<{ engagement_id: string; updated_at: string }> }));
vi.mock('@/lib/supabase', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: async () => ({ data: logRows.rows, error: null }),
  };
  return { supabase: { functions: { invoke }, from: () => chain } };
});

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

describe('the studio\'s own gallery email text', () => {
  const standard = en.gallery_ready.body;

  it('cleanGalleryMessage: plain text, tidy, null when empty or unchanged', () => {
    expect(cleanGalleryMessage(undefined, standard)).toBeNull();
    expect(cleanGalleryMessage(42, standard)).toBeNull();
    expect(cleanGalleryMessage('   \n ', standard)).toBeNull();
    expect(cleanGalleryMessage(` ${standard} `, standard)).toBeNull();
    expect(cleanGalleryMessage('Hello\r\n\r\n\r\n\r\nThanks  \n', standard)).toBe('Hello\n\nThanks');
    expect(cleanGalleryMessage('a\u0000b\u202Ec\td', standard)).toBe('abc d');
    expect(cleanGalleryMessage('x'.repeat(GALLERY_MESSAGE_MAX + 50), standard)).toHaveLength(GALLERY_MESSAGE_MAX);
  });

  it.each([
    ['en', en.gallery_ready],
    ['he', he.gallery_ready],
  ] as const)('%s: her words replace the main paragraph, escaped; the buttons stay', (language, strings) => {
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
        customBody: 'Thank you!\n<script>alert(1)</script> & <a href="https://evil.test">x</a>',
        customBodyReplaces: strings.body,
      },
    });
    expect(html).not.toContain(strings.body);
    expect(html).toContain('Thank you!<br>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;a href=&quot;https://evil.test&quot;&gt;x&lt;/a&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="https://evil.test"');
    expect(html).toContain('https://studio.smugmug.com/Pat');
    expect(html).toContain('https://studio.opalswift.com/shop/token');
    expect(html).toContain(strings.cta);
    expect(html).toContain(strings.closing);
  });
});

describe('a photo in the gallery email', () => {
  const base = 'https://ref.supabase.co';
  const tenant = '11111111-1111-4111-8111-111111111111';
  const ok = `${base}/storage/v1/object/public/tenant-assets/${tenant}/gallery-email/1795-ab12cd.jpg`;

  it('galleryEmailPhotoUrl: only this studio\'s own gallery email upload', () => {
    expect(galleryEmailPhotoUrl(ok, base, tenant)).toBe(ok);
    expect(galleryEmailPhotoUrl(ok, `${base}/`, tenant)).toBe(ok);
    expect(galleryEmailPhotoUrl(ok.replace(tenant, '22222222-2222-4222-8222-222222222222'), base, tenant)).toBeNull();
    expect(galleryEmailPhotoUrl(ok.replace('gallery-email', 'logo'), base, tenant)).toBeNull();
    expect(galleryEmailPhotoUrl(ok.replace('.jpg', '.svg'), base, tenant)).toBeNull();
    expect(galleryEmailPhotoUrl(`${ok}"onerror="x`, base, tenant)).toBeNull();
    expect(galleryEmailPhotoUrl(ok.replace('1795-ab12cd', '../x'), base, tenant)).toBeNull();
    expect(galleryEmailPhotoUrl('https://evil.test/a.jpg', base, tenant)).toBeNull();
    expect(galleryEmailPhotoUrl(42, base, tenant)).toBeNull();
  });

  it('cleanPhotoAlt: one plain line, or the fallback', () => {
    expect(cleanPhotoAlt('  Autumn\n in the\tpark ', 'Studio')).toBe('Autumn in the park');
    expect(cleanPhotoAlt('', 'Studio')).toBe('Studio');
    expect(cleanPhotoAlt(undefined, 'Studio')).toBe('Studio');
    expect(cleanPhotoAlt('x'.repeat(500), 'Studio')).toHaveLength(200);
  });

  it.each([
    ['en', en.gallery_ready],
    ['he', he.gallery_ready],
  ] as const)('%s: the photo sits under her message and above the gallery button', (language, strings) => {
    const { html } = renderPhotographerEmail({
      key: 'gallery_ready',
      language,
      schoolName: 'Studio',
      primaryColor: '#2563eb',
      accentColor: '#dc2626',
      variables: {
        recipientName: 'Pat',
        galleryUrl: 'https://studio.smugmug.com/Pat',
        customBody: 'Thank you!',
        customBodyReplaces: strings.body,
        photoUrl: ok,
        photoAlt: 'Park "autumn" <b>',
        photoAfter: strings.body,
      },
    });
    const photoAt = html.indexOf(`src="${ok}"`);
    expect(photoAt).toBeGreaterThan(html.indexOf('Thank you!'));
    expect(photoAt).toBeLessThan(html.indexOf('https://studio.smugmug.com/Pat'));
    expect(html).toContain('alt="Park &quot;autumn&quot; &lt;b&gt;"');
    expect(html.split(`src="${ok}"`).length - 1).toBe(1);
  });

  it('a link that is not http(s) never becomes a photo', () => {
    const { html } = renderPhotographerEmail({
      key: 'gallery_ready',
      language: 'en',
      schoolName: 'Studio',
      primaryColor: '#2563eb',
      accentColor: '#dc2626',
      variables: {
        recipientName: 'Pat',
        galleryUrl: 'https://studio.smugmug.com/Pat',
        photoUrl: 'javascript:alert(1)',
        photoAfter: en.gallery_ready.body,
      },
    });
    expect(html).not.toContain('javascript:alert(1)');
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

  it('passes resend on, off by default', async () => {
    invoke.mockResolvedValue({ data: { sent: 1, skipped: 0, failed: 0, results: [] }, error: null });
    await ShootGalleryService.send(['e1']);
    await ShootGalleryService.send(['e1'], { resend: true });
    expect(invoke.mock.calls.map((call) => call[1].body.resend)).toEqual([false, true]);
  });

  it('passes her message on only when there is one', async () => {
    invoke.mockResolvedValue({ data: { sent: 1, skipped: 0, failed: 0, results: [] }, error: null });
    await ShootGalleryService.send(['e1'], { resend: true, message: 'Hello' });
    await ShootGalleryService.send(['e1'], { resend: true });
    expect(invoke.mock.calls.map((call) => call[1].body.message)).toEqual(['Hello', undefined]);
    expect('message' in invoke.mock.calls[1][1].body).toBe(false);
  });

  it('passes the photo on only with an address', async () => {
    invoke.mockResolvedValue({ data: { sent: 1, skipped: 0, failed: 0, results: [] }, error: null });
    await ShootGalleryService.send(['e1'], { photoUrl: 'https://x.test/a.jpg', photoAlt: ' Park ' });
    await ShootGalleryService.send(['e1'], { photoAlt: 'Park' });
    expect(invoke.mock.calls[0][1].body).toMatchObject({ photoUrl: 'https://x.test/a.jpg', photoAlt: 'Park' });
    expect('photoAlt' in invoke.mock.calls[1][1].body).toBe(false);
  });

  it('lastSent: when each gallery email last went', async () => {
    logRows.rows = [{ engagement_id: 'e1', updated_at: '2026-11-18T17:40:00Z' }];
    const map = await ShootGalleryService.lastSent(['e1', 'e2']);
    expect(map.get('e1')).toBe('2026-11-18T17:40:00Z');
    expect(map.has('e2')).toBe(false);
  });

  it('throws when the function fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(ShootGalleryService.send(['e1'])).rejects.toThrow();
  });
});
