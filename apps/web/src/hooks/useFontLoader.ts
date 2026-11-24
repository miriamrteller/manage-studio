import { useEffect } from 'react';
import { useTenant } from './useTenant';

export type FontPairId = 'opalswift' | 'classic' | 'elegant' | 'soft' | 'bold' | 'statement';

export type FontPair = {
  id: FontPairId;
  name: string;
  /** Body text, English and Hebrew. */
  en: string;
  he: string;
  /** Optional heading font (h1–h4, .text-display/.text-h*); the body font when left out. */
  heading?: { en: string; he: string };
  /** The heading font only ships one weight: don't fake a bold. */
  headingSingleWeight?: boolean;
};

/** Used when a studio has chosen no font (font_pair null) and on OpalSwift's own screens. */
export const DEFAULT_FONT_PAIR: FontPairId = 'opalswift';

/**
 * Tenant-selectable font pairs: a short list of clearly different looks
 * (owner, 24 Nov 2026: the old list had too many similar options). Every
 * family listed here is self-hosted — bundled via the @fontsource imports in
 * src/fonts.ts — so adding a pair means adding its weight imports there too.
 * Nothing is fetched from fonts.googleapis.com at runtime. Every pair covers
 * Hebrew. Listed in the order the settings page shows them.
 */
export const FONT_PAIRS: Record<FontPairId, FontPair> = {
  // Modern sans. The marketing site's pairing: Rubik headings, Inter / Heebo body.
  opalswift: { id: 'opalswift', name: 'OpalSwift', en: 'Inter', he: 'Heebo', heading: { en: 'Rubik', he: 'Rubik' } },
  // Serif headings over a clean sans body.
  classic: {
    id: 'classic',
    name: 'Classic',
    en: 'Source Sans 3',
    he: 'Assistant',
    heading: { en: 'Frank Ruhl Libre', he: 'Frank Ruhl Libre' },
  },
  // Serif throughout.
  elegant: { id: 'elegant', name: 'Elegant', en: 'Crimson Text', he: 'Frank Ruhl Libre' },
  // Rounded, friendly headings.
  soft: {
    id: 'soft',
    name: 'Soft',
    en: 'Poppins',
    he: 'Assistant',
    heading: { en: 'Varela Round', he: 'Varela Round' },
    headingSingleWeight: true,
  },
  // Tall, condensed and strong.
  bold: { id: 'bold', name: 'Bold', en: 'Oswald', he: 'Miriam Libre' },
  // Heavy slab headings.
  statement: {
    id: 'statement',
    name: 'Statement',
    en: 'Source Sans 3',
    he: 'Heebo',
    heading: { en: 'Suez One', he: 'Suez One' },
    headingSingleWeight: true,
  },
};

/**
 * Pairs that were removed, and the kept pair closest to each, so a studio that
 * still has an old value stored looks (almost) the same. The migration
 * 20261124204900_fewer_font_pairs.sql moves stored values the same way.
 */
export const RETIRED_FONT_PAIRS: Record<string, FontPairId> = {
  reliable: 'opalswift', // same Inter / Heebo body
  warm: 'opalswift', // plain sans with Rubik
  studio: 'opalswift', // Inter body, sans headings
  dynamic: 'soft', // same Poppins / Assistant body
  literary: 'elegant', // same Crimson Text, serif Hebrew
};

/** A stored font_pair, or the default when none (or an unknown one) is stored. */
export function resolveFontPair(pairId: string | null | undefined): FontPair {
  if (pairId && Object.prototype.hasOwnProperty.call(FONT_PAIRS, pairId)) return FONT_PAIRS[pairId as FontPairId];
  if (pairId && Object.prototype.hasOwnProperty.call(RETIRED_FONT_PAIRS, pairId)) {
    return FONT_PAIRS[RETIRED_FONT_PAIRS[pairId]];
  }
  return FONT_PAIRS[DEFAULT_FONT_PAIR];
}

const LATIN_FALLBACKS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', sans-serif";

/* Heebo is bundled (src/fonts.ts) so every pair keeps a sans Hebrew face with
 * a real bold even if its own family somehow fails; Segoe UI and Arial carry
 * Hebrew glyphs on Windows, Arial Hebrew on macOS. Without these the browser's
 * per-script fallback can land on a boldless serif face like David. */
const HEBREW_FALLBACKS =
  "'Heebo', 'Noto Sans Hebrew', 'Segoe UI', 'Arial Hebrew', 'Arial', sans-serif";

export function injectFontPair(pairId: string | null | undefined): void {
  const pair = resolveFontPair(pairId);

  const root = document.documentElement;
  root.style.setProperty('--font-en', `'${pair.en}', ${LATIN_FALLBACKS}`);
  root.style.setProperty('--font-he', `'${pair.he}', ${HEBREW_FALLBACKS}`);
  root.style.setProperty('--font-family-sans', 'var(--font-en)');
  root.style.setProperty('--font-family-hebrew', 'var(--font-he)');
  const heading = pair.heading ?? { en: pair.en, he: pair.he };
  root.style.setProperty('--font-heading-en', `'${heading.en}', ${LATIN_FALLBACKS}`);
  root.style.setProperty('--font-heading-he', `'${heading.he}', ${HEBREW_FALLBACKS}`);
  root.style.setProperty('--font-heading-synthesis', pair.headingSingleWeight ? 'none' : 'weight style');
}

export function useFontLoader(): void {
  const tenant = useTenant();

  useEffect(() => {
    injectFontPair(tenant?.font_pair);
  }, [tenant?.font_pair]);
}
