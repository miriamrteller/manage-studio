// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toneFromPixels, chooseLogoTreatment, logoContrast, LOGO_MIN_CONTRAST, type LogoTone } from '@/lib/theme/logoTone';
import { HeaderLogo, headerSurface } from '@/components/Navigation/HeaderLogo';
import { deriveSoftTheme } from '@/lib/theme/deriveSoftTheme';
import type { TenantConfig } from '@/types/auth';

/** w×h RGBA image: `fill(x, y)` returns [r, g, b, a]. */
function image(w: number, h: number, fill: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) data.set(fill(x, y), (y * w + x) * 4);
  return data;
}
const inBox = (x: number, y: number) => x > 4 && x < 36 && y > 3 && y < 7;

describe('toneFromPixels', () => {
  it('reads a white wordmark on transparency as light, one-colour, no plate', () => {
    const tone = toneFromPixels(image(40, 10, (x, y) => (inBox(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 0])), 40, 10);
    expect(tone).toMatchObject({ mono: true, hasPlate: false, aspect: 4 });
    expect(tone?.luminance).toBeCloseTo(1, 2);
  });

  it('reads a multi-colour logo as not one-colour', () => {
    const tone = toneFromPixels(image(40, 10, (x, y) => (inBox(x, y) ? (x < 20 ? [230, 30, 30, 255] : [30, 30, 230, 255]) : [0, 0, 0, 0])), 40, 10);
    expect(tone?.mono).toBe(false);
  });

  it('detects a logo with its own background box', () => {
    const tone = toneFromPixels(image(40, 10, (x, y) => (inBox(x, y) ? [20, 20, 20, 255] : [255, 255, 255, 255])), 40, 10);
    expect(tone).toMatchObject({ hasPlate: true, mono: false });
  });

  it('returns null for a fully transparent image', () => {
    expect(toneFromPixels(image(8, 8, () => [0, 0, 0, 0]), 8, 8)).toBeNull();
  });
});

const tone = (luminance: number, extra: Partial<LogoTone> = {}): LogoTone => ({ luminance, mono: false, hasPlate: false, aspect: 3, ...extra });
const dance = { white_label: { primary_color: '#76335a', accent_color: '#e99ac4' } } as unknown as TenantConfig;
const SOFT = headerSurface(dance, true);
const SOLID = headerSurface(dance, false);

describe('chooseLogoTreatment (order from proposal 4.4)', () => {
  it('shows a logo that already contrasts as uploaded', () => {
    expect(chooseLogoTreatment({ logoUrl: 'a.png', logoTone: tone(0.02) }, SOFT)).toEqual({ kind: 'image', src: 'a.png' });
  });
  it('1. prefers the other uploaded logo when it contrasts', () => {
    expect(chooseLogoTreatment({ logoUrl: 'white.png', logoTone: tone(0.95), logoDarkUrl: 'dark.png', logoDarkTone: tone(0.02) }, SOFT))
      .toEqual({ kind: 'image', src: 'dark.png' });
  });
  it('2. keeps a logo with its own background as uploaded', () => {
    expect(chooseLogoTreatment({ logoUrl: 'box.jpg', logoTone: tone(0.9, { hasPlate: true }) }, SOFT))
      .toEqual({ kind: 'image', src: 'box.jpg', plate: true });
  });
  it('3. recolours a one-colour light logo to the brand ink', () => {
    const tr = chooseLogoTreatment({ logoUrl: 'white.png', logoTone: tone(0.98, { mono: true }) }, SOFT);
    expect(tr).toEqual({ kind: 'recolour', src: 'white.png', color: SOFT.recolour, aspect: 3 });
  });
  it('4. puts a multi-colour logo that fails on a brand-colour pill', () => {
    expect(chooseLogoTreatment({ logoUrl: 'pastel.png', logoTone: tone(0.8) }, SOFT))
      .toEqual({ kind: 'pill', src: 'pastel.png', background: SOFT.pill });
  });
  it('puts an unmeasured logo on the pill (it was made for the old solid header)', () => {
    expect(chooseLogoTreatment({ logoUrl: 'old.png', logoTone: null }, SOFT).kind).toBe('pill');
  });
  it('respects "show exactly as uploaded"', () => {
    expect(chooseLogoTreatment({ logoUrl: 'white.png', logoTone: tone(0.98, { mono: true }), autofix: false }, SOFT))
      .toEqual({ kind: 'image', src: 'white.png' });
  });
  it('fixes a dark one-colour logo on the solid header with the on-fill colour', () => {
    const tr = chooseLogoTreatment({ logoUrl: 'black.png', logoTone: tone(0.01, { mono: true }) }, SOLID);
    expect(tr).toMatchObject({ kind: 'recolour', color: SOLID.recolour });
  });
  it('falls back to the tenant name without a logo', () => {
    expect(chooseLogoTreatment({}, SOFT)).toEqual({ kind: 'name' });
  });
});

describe('recoloured logos reach the visibility target for any brand', () => {
  const brands = ['#76335a', '#1F5F5B', '#F97316', '#1D4ED8', '#4CAF50', '#6D1A36', '#FACC15', '#93C5FD', '#111827'];
  it.each(brands)('%s: brand-ink logo on the soft header >= 3:1', (primary) => {
    const t = deriveSoftTheme(primary, '#e99ac4');
    // A recoloured logo IS the ink colour: compare it against both ends of the header gradient.
    const recoloured = tone(lum(t['--color-primary-ink']), { mono: true });
    for (const bg of [t['--tint-2'], t['--tint-accent-2']]) {
      expect(logoContrast(recoloured, bg)).toBeGreaterThanOrEqual(LOGO_MIN_CONTRAST);
    }
  });
});

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

describe('HeaderLogo', () => {
  afterEach(cleanup);
  const renderLogo = (tenant: TenantConfig, soft: boolean) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HeaderLogo tenant={tenant} soft={soft} />
      </QueryClientProvider>,
    );

  it('renders a recoloured logo as a labelled masked shape on the soft header', () => {
    renderLogo({ ...dance, name: 'Studio', logo_url: 'https://x/white.png', logo_tone: tone(0.98, { mono: true }) } as TenantConfig, true);
    const el = screen.getByRole('img', { name: 'Studio' });
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('style')).toContain('white.png');
  });

  it('renders the logo as uploaded on the solid header when it contrasts there', () => {
    renderLogo({ ...dance, name: 'Studio', logo_url: 'https://x/white.png', logo_tone: tone(0.98, { mono: true }) } as TenantConfig, false);
    expect(screen.getByRole('img', { name: 'Studio' }).tagName).toBe('IMG');
  });

  it('without a logo, the name keeps its own direction and truncates at its end', () => {
    renderLogo({ ...dance, name: 'Lumen & Light Photography', logo_url: undefined, logo_dark_url: undefined } as TenantConfig, true);
    const el = screen.getByText('Lumen & Light Photography');
    // dir="auto" keeps an English name LTR inside a Hebrew header, so the
    // ellipsis lands at the end instead of the first letters being cut off.
    expect(el.getAttribute('dir')).toBe('auto');
    expect(el).toHaveClass('block', 'min-w-0', 'truncate');
  });
});
