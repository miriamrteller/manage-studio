import { useEffect } from 'react';
import { useTenant } from './useTenant';

export type FontPairId = 'reliable' | 'elegant' | 'dynamic' | 'warm' | 'bold';

export type FontPair = {
  id: FontPairId;
  name: string;
  en: string;
  he: string;
  googleFamilies: string;
};

export const FONT_PAIRS: Record<FontPairId, FontPair> = {
  reliable: {
    id: 'reliable',
    name: 'Reliable',
    en: 'Inter',
    he: 'Heebo',
    googleFamilies: 'Inter:wght@300;400;500;600;700&family=Heebo:wght@300;400;500;600;700',
  },
  elegant: {
    id: 'elegant',
    name: 'Elegant',
    en: 'Crimson Text',
    he: 'Frank Ruhl Libre',
    googleFamilies: 'Crimson+Text:ital,wght@0,400;0,600;1,400&family=Frank+Ruhl+Libre:wght@300;400;500;700',
  },
  dynamic: {
    id: 'dynamic',
    name: 'Dynamic',
    en: 'Poppins',
    he: 'Assistant',
    googleFamilies: 'Poppins:wght@300;400;500;600;700&family=Assistant:wght@300;400;500;600;700',
  },
  warm: {
    id: 'warm',
    name: 'Warm',
    en: 'Source Sans 3',
    he: 'Rubik',
    googleFamilies: 'Source+Sans+3:wght@300;400;500;600;700&family=Rubik:wght@300;400;500;600;700',
  },
  bold: {
    id: 'bold',
    name: 'Bold',
    en: 'Oswald',
    he: 'Miriam Libre',
    googleFamilies: 'Oswald:wght@300;400;500;600;700&family=Miriam+Libre:wght@400;700',
  },
};

const FONT_LINK_ID = 'font-pair-link';

export function injectFontPair(pairId: string): void {
  const resolvedPairId = (pairId in FONT_PAIRS ? pairId : 'reliable') as FontPairId;
  const pair = FONT_PAIRS[resolvedPairId];

  const existingLink = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;

  if (existingLink && existingLink.getAttribute('data-pair') === resolvedPairId) {
    return;
  }

  if (existingLink) {
    existingLink.remove();
  }

  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.setAttribute('data-pair', resolvedPairId);
  link.href = `https://fonts.googleapis.com/css2?family=${pair.googleFamilies}&display=swap`;

  document.head.appendChild(link);

  const root = document.documentElement;
  root.style.setProperty('--font-en', `'${pair.en}', sans-serif`);
  root.style.setProperty('--font-he', `'${pair.he}', 'Noto Sans Hebrew', sans-serif`);
  root.style.setProperty('--font-family-sans', 'var(--font-en)');
  root.style.setProperty('--font-family-hebrew', 'var(--font-he)');
}

export function useFontLoader(): void {
  const { tenant } = useTenant();

  useEffect(() => {
    injectFontPair(tenant?.font_pair ?? 'reliable');
  }, [tenant?.font_pair]);
}
