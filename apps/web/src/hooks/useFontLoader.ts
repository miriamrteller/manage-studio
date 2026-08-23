import { useEffect } from 'react';
import { useTenant } from './useTenant';

export type FontPairId = 'reliable' | 'elegant' | 'dynamic' | 'warm' | 'bold';

export type FontPair = {
  id: FontPairId;
  name: string;
  en: string;
  he: string;
};

/**
 * Tenant-selectable font pairs. Every family listed here is self-hosted —
 * bundled via the @fontsource imports in src/fonts.ts — so adding a pair
 * means adding its weight imports there too. Nothing is fetched from
 * fonts.googleapis.com at runtime any more.
 */
export const FONT_PAIRS: Record<FontPairId, FontPair> = {
  reliable: {
    id: 'reliable',
    name: 'Reliable',
    en: 'Inter',
    he: 'Heebo',
  },
  elegant: {
    id: 'elegant',
    name: 'Elegant',
    en: 'Crimson Text',
    he: 'Frank Ruhl Libre',
  },
  dynamic: {
    id: 'dynamic',
    name: 'Dynamic',
    en: 'Poppins',
    he: 'Assistant',
  },
  warm: {
    id: 'warm',
    name: 'Warm',
    en: 'Source Sans 3',
    he: 'Rubik',
  },
  bold: {
    id: 'bold',
    name: 'Bold',
    en: 'Oswald',
    he: 'Miriam Libre',
  },
};

const LATIN_FALLBACKS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', sans-serif";

/* Heebo is bundled (src/fonts.ts) so every pair keeps a sans Hebrew face with
 * a real bold even if its own family somehow fails; Segoe UI and Arial carry
 * Hebrew glyphs on Windows, Arial Hebrew on macOS. Without these the browser's
 * per-script fallback can land on a boldless serif face like David. */
const HEBREW_FALLBACKS =
  "'Heebo', 'Noto Sans Hebrew', 'Segoe UI', 'Arial Hebrew', 'Arial', sans-serif";

export function injectFontPair(pairId: string): void {
  const resolvedPairId = (pairId in FONT_PAIRS ? pairId : 'reliable') as FontPairId;
  const pair = FONT_PAIRS[resolvedPairId];

  const root = document.documentElement;
  root.style.setProperty('--font-en', `'${pair.en}', ${LATIN_FALLBACKS}`);
  root.style.setProperty('--font-he', `'${pair.he}', ${HEBREW_FALLBACKS}`);
  root.style.setProperty('--font-family-sans', 'var(--font-en)');
  root.style.setProperty('--font-family-hebrew', 'var(--font-he)');
}

export function useFontLoader(): void {
  const tenant = useTenant();

  useEffect(() => {
    injectFontPair(tenant?.font_pair ?? 'reliable');
  }, [tenant?.font_pair]);
}
