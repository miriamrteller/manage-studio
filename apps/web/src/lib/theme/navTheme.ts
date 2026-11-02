/**
 * Side-menu colours, derived from a studio's primary and accent.
 *
 * The menu is a deep, dark base (the primary mixed strongly toward near-black)
 * with, in "soft" chrome, a faint accent glow (~15%) in one corner for depth.
 * "Solid" chrome is the flat base. Menu text is white; the primary share is
 * lowered until white text holds WCAG AA on the base, on the brightest point of
 * the glow, and on the hover / active rows, so any studio colour is safe.
 */
import { AA, WHITE, contrast, mix } from './color';

export const NAV_NEAR_BLACK = '#0b0f1a';
/** Share of the primary kept in the base (the rest is near-black). */
const BASE_SHARE = 0.32;
/** Accent share at the brightest point of the soft glow. */
export const NAV_GLOW = 0.15;

export interface NavTheme {
  '--nav-base': string;
  '--nav-corner': string;
  '--nav-hover': string;
  '--nav-active': string;
  '--nav-border': string;
  '--nav-text': string;
}

/** White overlays for hovered / active rows; they sit on the base or the glow. */
export const NAV_HOVER_ALPHA = 0.1;
export const NAV_ACTIVE_ALPHA = 0.16;

export function deriveNavTheme(primary: string, accent?: string): NavTheme {
  const glowColor = accent || primary;
  let share = BASE_SHARE;
  for (;;) {
    const base = mix(primary, NAV_NEAR_BLACK, share);
    const corner = mix(glowColor, base, NAV_GLOW);
    // Worst case for white text: an active row on the brightest point of the glow.
    const worst = mix(WHITE, corner, NAV_ACTIVE_ALPHA);
    if (share <= 0.02 || contrast(WHITE, worst) >= AA) {
      return {
        '--nav-base': base,
        '--nav-corner': corner,
        '--nav-hover': `rgb(255 255 255 / ${NAV_HOVER_ALPHA})`,
        '--nav-active': `rgb(255 255 255 / ${NAV_ACTIVE_ALPHA})`,
        '--nav-border': `rgb(255 255 255 / 0.14)`,
        '--nav-text': WHITE,
      };
    }
    share -= 0.02;
  }
}
