/**
 * Creative Ballet's report: a 512×512 transparent PNG ribbon with soft alpha
 * fades (purple #76335A light logo, pale pink dark logo) must show as itself,
 * never as a filled box, and every upload gets a fresh URL so a cached old
 * file can't be shown.
 * Run: pnpm -C apps/web test logo-soft-alpha.test.ts
 */
import { describe, it, expect } from 'vitest';
import { chooseLogoTreatment, toneFromPixels } from '@/lib/theme/logoTone';
import { headerSurface } from '@/components/Navigation/HeaderLogo';
import { logoObjectPath, logoPathFromUrl } from '@/lib/tenantLogoStorage';
import type { TenantConfig } from '@/types/auth';

/** A round mark: solid in the middle, fading to transparent at its edge, transparent corners. */
function softMark(size: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - c, y - c) / c; // 0 centre … 1 edge
      const alpha = d < 0.5 ? 255 : d < 0.9 ? Math.round(255 * (1 - (d - 0.5) / 0.4)) : 0;
      data.set([...rgb, alpha], (y * size + x) * 4);
    }
  }
  return data;
}

const PURPLE: [number, number, number] = [0x76, 0x33, 0x5a];
const PINK: [number, number, number] = [0xf6, 0xd6, 0xe4];

describe('a soft-alpha transparent logo', () => {
  const light = toneFromPixels(softMark(128, PURPLE), 128, 128)!;
  const dark = toneFromPixels(softMark(128, PINK), 128, 128)!;

  it('is measured by its own colour, with no background box', () => {
    expect(light.hasPlate).toBe(false);
    expect(light.luminance).toBeLessThan(0.1);
    expect(dark.hasPlate).toBe(false);
    expect(dark.luminance).toBeGreaterThan(0.6);
  });

  it('shows as uploaded on both header styles (never a pill or a recoloured box)', () => {
    const tenant = { white_label: { primary_color: '#76335A', accent_color: '#C9A0B4' } } as unknown as TenantConfig;
    const input = { logoUrl: 'https://x/l.png', logoTone: light, logoDarkUrl: 'https://x/d.png', logoDarkTone: dark };
    expect(chooseLogoTreatment(input, headerSurface(tenant, true))).toEqual({ kind: 'image', src: 'https://x/l.png' });
    expect(chooseLogoTreatment(input, headerSurface(tenant, false))).toEqual({ kind: 'image', src: 'https://x/d.png' });
  });
});

describe('logo storage paths', () => {
  const T = 'f9f4aac3-0000-4000-8000-000000000000';

  it('a new file name per upload, so the URL changes', () => {
    expect(logoObjectPath(T, 'light', 'Ribbon.PNG', 1000)).toBe(`${T}/logo-1000.png`);
    expect(logoObjectPath(T, 'dark', 'ribbon.png', 2000)).toBe(`${T}/logo-dark-2000.png`);
    expect(logoObjectPath(T, 'light', 'noext', 3)).toBe(`${T}/logo-3.png`);
    expect(logoObjectPath(T, 'light', 'a.png', 1)).not.toBe(logoObjectPath(T, 'light', 'a.png', 2));
  });

  it('finds the replaced file only for this studio\'s logos', () => {
    const base = 'https://p.supabase.co/storage/v1/object/public/tenant-assets/';
    expect(logoPathFromUrl(`${base}${T}/logo.png`, T)).toBe(`${T}/logo.png`);
    expect(logoPathFromUrl(`${base}${T}/logo-dark-5.png?v=1`, T)).toBe(`${T}/logo-dark-5.png`);
    expect(logoPathFromUrl(`${base}other/logo.png`, T)).toBeNull();
    expect(logoPathFromUrl(`${base}${T}/lead-forms/x.png`, T)).toBeNull();
    expect(logoPathFromUrl('https://elsewhere.test/logo.png', T)).toBeNull();
    expect(logoPathFromUrl(null, T)).toBeNull();
  });
});
