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
import { DEFAULT_FONT_PAIR, FONT_PAIRS, RETIRED_FONT_PAIRS, injectFontPair, resolveFontPair } from '@/hooks/useFontLoader';
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

  it('a stored choice is kept; a pair with no heading font uses its body font for headings', () => {
    expect(resolveFontPair('elegant').id).toBe('elegant');
    expect(resolveFontPair('soft').id).toBe('soft');
    injectFontPair('elegant');
    expect(css('--font-heading-en')).toMatch(/^'Crimson Text'/);
    expect(css('--font-heading-he')).toMatch(/^'Frank Ruhl Libre'/);
    expect(css('--font-heading-synthesis')).toBe('weight style');
  });

  it('single-weight heading faces turn off faux bold', () => {
    injectFontPair('soft');
    expect(css('--font-heading-en')).toMatch(/^'Varela Round'/);
    expect(css('--font-heading-synthesis')).toBe('none');
  });

  it('offers a short list of different looks, and removed pairs fall back to the closest kept one', () => {
    expect(Object.keys(FONT_PAIRS)).toEqual(['opalswift', 'classic', 'elegant', 'soft', 'bold', 'statement']);
    const looks = Object.values(FONT_PAIRS).map((p) => `${p.en}|${p.he}|${p.heading?.en ?? ''}`);
    expect(new Set(looks).size).toBe(looks.length);
    expect(resolveFontPair('reliable').id).toBe('opalswift');
    expect(resolveFontPair('warm').id).toBe('opalswift');
    expect(resolveFontPair('studio').id).toBe('opalswift');
    expect(resolveFontPair('dynamic').id).toBe('soft');
    expect(resolveFontPair('literary').id).toBe('elegant');
    for (const target of Object.values(RETIRED_FONT_PAIRS)) expect(FONT_PAIRS).toHaveProperty(target);
    // The migration moves stored values the same way the app does on read.
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261124204900_fewer_font_pairs.sql'), 'utf8');
    for (const [from, to] of Object.entries(RETIRED_FONT_PAIRS)) {
      expect(sql).toMatch(new RegExp(`WHEN '${from}'\\s+THEN '${to}'`));
    }
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
