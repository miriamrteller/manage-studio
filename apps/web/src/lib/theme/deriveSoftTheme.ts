/**
 * Soft theme tokens derived from a tenant's brand colours
 * (docs/design/photographer-theme-proposal.md, section 4).
 *
 * - Tints sit at fixed WCAG luminance targets, so every brand gets equally
 *   subtle washes (10% of yellow and 10% of navy look nothing alike; equal
 *   luminance does).
 * - "Ink" variants are the brand colour darkened only as far as needed to
 *   read as text (>= 4.5:1) on white and on the tints it can land on. Dark
 *   brands keep their exact colour.
 * - The button fill is the brand colour unless no text colour reaches 4.5:1
 *   on it, in which case it is nudged darker.
 *
 * useThemeInjection() writes every returned key as a CSS custom property on
 * <html>. The gradients that use these tokens are composed in index.css.
 */
import {
  AA,
  BLACK,
  WHITE,
  contrast,
  normalizeHex,
  onColor,
  pushUntilContrast,
  tintToLuminance,
} from './color';

/** WCAG relative-luminance targets for the tint ramp. */
export const TINT_TARGETS = { ground: 0.97, t1: 0.93, t2: 0.87, t3: 0.78 } as const;

type TintKey = keyof typeof TINT_TARGETS;
type Tints = Record<TintKey, string>;

function tintsOf(color: string): Tints {
  return {
    ground: tintToLuminance(color, TINT_TARGETS.ground),
    t1: tintToLuminance(color, TINT_TARGETS.t1),
    t2: tintToLuminance(color, TINT_TARGETS.t2),
    t3: tintToLuminance(color, TINT_TARGETS.t3),
  };
}

/** Surfaces brand-coloured text can sit on: white plus the lighter tints. */
export function textSurfaces(tints: Tints): string[] {
  return [WHITE, tints.ground, tints.t1, tints.t2];
}

export interface SoftTheme {
  '--color-primary-fill': string;
  '--color-on-primary-fill': string;
  '--color-primary-ink': string;
  '--color-accent-ink': string;
  '--tint-ground': string;
  '--tint-1': string;
  '--tint-2': string;
  '--tint-3': string;
  '--tint-accent-1': string;
  '--tint-accent-2': string;
}

export function deriveSoftTheme(primaryInput: string, accentInput: string): SoftTheme {
  const primary = normalizeHex(primaryInput);
  const accent = normalizeHex(accentInput);
  const p = tintsOf(primary);
  const a = tintsOf(accent);
  const fill = contrast(onColor(primary), primary) >= AA ? primary : pushUntilContrast(primary, [WHITE], BLACK);
  return {
    '--color-primary-fill': fill,
    '--color-on-primary-fill': onColor(fill),
    '--color-primary-ink': pushUntilContrast(primary, textSurfaces(p)),
    '--color-accent-ink': pushUntilContrast(accent, textSurfaces(a)),
    '--tint-ground': p.ground,
    '--tint-1': p.t1,
    '--tint-2': p.t2,
    '--tint-3': p.t3,
    '--tint-accent-1': a.t1,
    '--tint-accent-2': a.t2,
  };
}
