import type { LogoTone } from '@/lib/theme/logoTone';

interface FaviconSource {
  logo_url?: string | null;
  logo_dark_url?: string | null;
  logo_tone?: LogoTone | null;
  logo_dark_tone?: LogoTone | null;
}

/** How far a logo is from square (1 = square). Unknown shape counts as fairly wide. */
const squareness = (tone?: LogoTone | null) => {
  const aspect = tone?.aspect;
  if (!aspect || aspect <= 0) return 3;
  return aspect >= 1 ? aspect : 1 / aspect;
};

/**
 * The studio logo to show as the browser-tab icon: the main (light-background)
 * logo, or the dark-background one when it is clearly squarer or the only one.
 * Null: use OpalSwift's icon.
 */
export function studioFaviconUrl(tenant: FaviconSource | null | undefined): string | null {
  const light = tenant?.logo_url?.trim() || null;
  const dark = tenant?.logo_dark_url?.trim() || null;
  if (!light) return dark;
  if (!dark) return light;
  return squareness(tenant?.logo_dark_tone) < squareness(tenant?.logo_tone) / 1.5 ? dark : light;
}

const ICON_SELECTOR = 'link[rel~="icon"], link[rel="apple-touch-icon"]';
const DEFAULT_HREF = 'data-default-href';
const DEFAULT_TYPE = 'data-default-type';
const DEFAULT_SIZES = 'data-default-sizes';

/**
 * Points the page's icon links (favicon and apple-touch-icon) at `url`, or back
 * at OpalSwift's own icons when `url` is null. Each upload has its own URL, so
 * a new logo shows as soon as the studio reloads its details.
 */
export function applyFavicon(url: string | null, doc: Document = document): void {
  doc.querySelectorAll<HTMLLinkElement>(ICON_SELECTOR).forEach((link) => {
    if (!link.hasAttribute(DEFAULT_HREF)) {
      link.setAttribute(DEFAULT_HREF, link.getAttribute('href') ?? '');
      link.setAttribute(DEFAULT_TYPE, link.getAttribute('type') ?? '');
      link.setAttribute(DEFAULT_SIZES, link.getAttribute('sizes') ?? '');
    }
    const restore = (attr: string, saved: string) => {
      const value = link.getAttribute(saved) ?? '';
      if (value) link.setAttribute(attr, value);
      else link.removeAttribute(attr);
    };
    if (url) {
      if (link.getAttribute('href') === url) return;
      link.setAttribute('href', url);
      // The logo can be any image type and size.
      link.removeAttribute('type');
      link.removeAttribute('sizes');
    } else {
      restore('href', DEFAULT_HREF);
      restore('type', DEFAULT_TYPE);
      restore('sizes', DEFAULT_SIZES);
    }
  });
}
