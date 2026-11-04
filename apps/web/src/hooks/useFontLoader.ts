import { useEffect } from 'react';
import { useTenant } from './useTenant';

export type FontPairId =
  | 'opalswift'
  | 'reliable'
  | 'elegant'
  | 'dynamic'
  | 'warm'
  | 'bold'
  | 'classic'
  | 'literary'
  | 'studio'
  | 'statement'
  | 'soft';

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
 * Tenant-selectable font pairs. Every family listed here is self-hosted —
 * bundled via the @fontsource imports in src/fonts.ts — so adding a pair
 * means adding its weight imports there too. Nothing is fetched from
 * fonts.googleapis.com at runtime. Every pair covers Hebrew.
 */
export const FONT_PAIRS: Record<FontPairId, FontPair> = {
  // The marketing site's pairing: Rubik headings, Inter / Heebo body.
  opalswift: { id: 'opalswift', name: 'OpalSwift', en: 'Inter', he: 'Heebo', heading: { en: 'Rubik', he: 'Rubik' } },
  reliable: { id: 'reliable', name: 'Reliable', en: 'Inter', he: 'Heebo' },
  elegant: { id: 'elegant', name: 'Elegant', en: 'Crimson Text', he: 'Frank Ruhl Libre' },
  dynamic: { id: 'dynamic', name: 'Dynamic', en: 'Poppins', he: 'Assistant' },
  warm: { id: 'warm', name: 'Warm', en: 'Source Sans 3', he: 'Rubik' },
  bold: { id: 'bold', name: 'Bold', en: 'Oswald', he: 'Miriam Libre' },
  classic: {
    id: 'classic',
    name: 'Classic',
    en: 'Source Sans 3',
    he: 'Assistant',
    heading: { en: 'Frank Ruhl Libre', he: 'Frank Ruhl Libre' },
  },
  literary: { id: 'literary', name: 'Literary', en: 'Crimson Text', he: 'Noto Serif Hebrew' },
  studio: {
    id: 'studio',
    name: 'Studio',
    en: 'Inter',
    he: 'Assistant',
    heading: { en: 'Secular One', he: 'Secular One' },
    headingSingleWeight: true,
  },
  statement: {
    id: 'statement',
    name: 'Statement',
    en: 'Source Sans 3',
    he: 'Heebo',
    heading: { en: 'Suez One', he: 'Suez One' },
    headingSingleWeight: true,
  },
  soft: {
    id: 'soft',
    name: 'Soft',
    en: 'Poppins',
    he: 'Assistant',
    heading: { en: 'Varela Round', he: 'Varela Round' },
    headingSingleWeight: true,
  },
};

/** A stored font_pair, or the default when none (or an unknown one) is stored. */
export function resolveFontPair(pairId: string | null | undefined): FontPair {
  return pairId && pairId in FONT_PAIRS ? FONT_PAIRS[pairId as FontPairId] : FONT_PAIRS[DEFAULT_FONT_PAIR];
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
