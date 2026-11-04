// @vitest-environment jsdom
/**
 * Font pairs: the OpalSwift pairing (Rubik headings, Inter / Heebo text) is the
 * default for studios with no choice and for OpalSwift's own screens; stored
 * choices are kept; every pair is self-hosted and has a translated name.
 * Run: pnpm -C apps/web test font-pairs.test.tsx
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_FONT_PAIR, FONT_PAIRS, injectFontPair, resolveFontPair } from '@/hooks/useFontLoader';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';

const css = (name: string) => document.documentElement.style.getPropertyValue(name);
afterEach(() => document.documentElement.removeAttribute('style'));

describe('font pairs', () => {
  it('no choice (or an unknown one) → the OpalSwift pairing', () => {
    expect(DEFAULT_FONT_PAIR).toBe('opalswift');
    expect(resolveFontPair(null).id).toBe('opalswift');
    expect(resolveFontPair('gone').id).toBe('opalswift');
    injectFontPair(null);
    expect(css('--font-en')).toMatch(/^'Inter'/);
    expect(css('--font-he')).toMatch(/^'Heebo'/);
    expect(css('--font-heading-en')).toMatch(/^'Rubik'/);
    expect(css('--font-heading-he')).toMatch(/^'Rubik'/);
  });

  it('a stored choice is kept; Reliable is still Inter / Heebo with matching headings', () => {
    expect(resolveFontPair('elegant').id).toBe('elegant');
    injectFontPair('reliable');
    expect(css('--font-heading-en')).toMatch(/^'Inter'/);
    expect(css('--font-heading-he')).toMatch(/^'Heebo'/);
    expect(css('--font-heading-synthesis')).toBe('weight style');
  });

  it('single-weight heading faces turn off faux bold', () => {
    injectFontPair('studio');
    expect(css('--font-heading-en')).toMatch(/^'Secular One'/);
    expect(css('--font-heading-synthesis')).toBe('none');
  });

  it('every family is self-hosted with a Hebrew subset for the Hebrew faces, and every pair is named in en + he', () => {
    const fonts = readFileSync(resolve(__dirname, '../fonts.ts'), 'utf8');
    const slug = (family: string) => family.toLowerCase().replace(/\s+/g, '-');
    for (const pair of Object.values(FONT_PAIRS)) {
      const heading = pair.heading ?? { en: pair.en, he: pair.he };
      for (const family of [pair.en, heading.en]) expect(fonts, family).toContain(`@fontsource/${slug(family)}/latin-`);
      for (const family of [pair.he, heading.he]) expect(fonts, family).toContain(`@fontsource/${slug(family)}/hebrew-`);
      expect(en.settings.branding.fontPairs, pair.id).toHaveProperty(pair.id);
      expect(he.settings.branding.fontPairs, pair.id).toHaveProperty(pair.id);
    }
    expect(fonts).not.toMatch(/import .*googleapis/);
  });
});
