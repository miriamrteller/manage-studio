// @vitest-environment jsdom
/**
 * The browser-tab icon on a studio host is the studio's logo; OpalSwift's icon
 * stays when there is no logo (and on app.opalswift.com, which has no studio).
 * A new upload (a new URL) replaces the icon.
 * Run: pnpm -C apps/web test studio-favicon.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const h = vi.hoisted(() => ({ tenant: null as Record<string, unknown> | null }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => h.tenant }));

import { StudioFavicon } from '@/components/StudioFavicon';
import { applyFavicon, studioFaviconUrl } from '@/lib/studioFavicon';

const LOGO = 'https://cdn.example/logos/t-1/light-111.png';

function headLinks() {
  document.head.innerHTML = `
    <link rel="icon" href="/favicon.ico" sizes="48x48 32x32 16x16" />
    <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`;
}
const hrefs = () =>
  Array.from(document.head.querySelectorAll('link')).map((l) => l.getAttribute('href'));

beforeEach(() => {
  headLinks();
  h.tenant = null;
});

describe('which logo becomes the icon', () => {
  it('the main logo; the dark one only if it is the only one or clearly squarer', () => {
    expect(studioFaviconUrl(null)).toBeNull();
    expect(studioFaviconUrl({})).toBeNull();
    expect(studioFaviconUrl({ logo_url: LOGO })).toBe(LOGO);
    expect(studioFaviconUrl({ logo_dark_url: 'dark.png' })).toBe('dark.png');
    expect(studioFaviconUrl({ logo_url: LOGO, logo_dark_url: 'dark.png' })).toBe(LOGO);
    const tone = (aspect: number) => ({ luminance: 0.5, mono: false, hasPlate: false, aspect });
    expect(
      studioFaviconUrl({ logo_url: LOGO, logo_tone: tone(4), logo_dark_url: 'dark.png', logo_dark_tone: tone(1) }),
    ).toBe('dark.png');
    expect(
      studioFaviconUrl({ logo_url: LOGO, logo_tone: tone(1.2), logo_dark_url: 'dark.png', logo_dark_tone: tone(1) }),
    ).toBe(LOGO);
  });
});

describe('the tab icon', () => {
  it('uses the studio logo for the favicon and the apple-touch-icon', () => {
    h.tenant = { logo_url: LOGO };
    render(<StudioFavicon />);
    expect(hrefs()).toEqual([LOGO, LOGO, LOGO]);
    // Any image type and size.
    for (const link of document.head.querySelectorAll('link')) {
      expect(link.hasAttribute('type')).toBe(false);
      expect(link.hasAttribute('sizes')).toBe(false);
    }
  });

  it('keeps OpalSwift icons with no logo, and on the platform host (no studio)', () => {
    h.tenant = { name: 'Creative Ballet', logo_url: null };
    const { unmount } = render(<StudioFavicon />);
    expect(hrefs()).toEqual(['/favicon.ico', '/favicon-64.png', '/apple-touch-icon.png']);
    unmount();
    h.tenant = null;
    render(<StudioFavicon />);
    expect(hrefs()).toEqual(['/favicon.ico', '/favicon-64.png', '/apple-touch-icon.png']);
  });

  it('a new upload (new URL) replaces the icon, and removing the logo restores OpalSwift', () => {
    h.tenant = { logo_url: LOGO };
    const { rerender } = render(<StudioFavicon />);
    const next = 'https://cdn.example/logos/t-1/light-222.png';
    h.tenant = { logo_url: next };
    rerender(<StudioFavicon />);
    expect(hrefs()).toEqual([next, next, next]);
    h.tenant = { logo_url: null };
    rerender(<StudioFavicon />);
    expect(hrefs()).toEqual(['/favicon.ico', '/favicon-64.png', '/apple-touch-icon.png']);
    const [ico, png] = document.head.querySelectorAll('link');
    expect(ico.getAttribute('sizes')).toBe('48x48 32x32 16x16');
    expect(png.getAttribute('type')).toBe('image/png');
  });

  it('restoring twice is harmless', () => {
    applyFavicon(null);
    applyFavicon(null);
    expect(hrefs()).toEqual(['/favicon.ico', '/favicon-64.png', '/apple-touch-icon.png']);
  });
});
