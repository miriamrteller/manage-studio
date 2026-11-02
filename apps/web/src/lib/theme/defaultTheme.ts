/**
 * Default theme for every studio and every tenant-less screen (login, welcome,
 * "Studio not found"). A studio's own saved colours/logo override it.
 *
 * Defaults are keyed by skin (vertical: dance, photographer, ...) so a skin can
 * get its own default later; OpalSwift is the fallback for every skin without
 * an entry. Do not add skin colours until they are designed.
 *
 * index.css :root holds the first-paint values of the OpalSwift default;
 * softThemeCss.test pins them to `defaultThemeTokens()`.
 */
import { deriveColorSystem } from '@/lib/utils';
import { deriveSoftTheme } from './deriveSoftTheme';
import { mix } from './color';
import { deriveNavTheme } from './navTheme';
import { OPALSWIFT_BRAND } from './opalswiftBrand';

export interface DefaultTheme {
  primary: string;
  secondary: string;
  /** AA-safe shade for button fills and brand text (white text sits on it). */
  ink: string;
}

export const OPALSWIFT_THEME: DefaultTheme = {
  primary: OPALSWIFT_BRAND.primary,
  secondary: OPALSWIFT_BRAND.accent,
  ink: OPALSWIFT_BRAND.ink.toLowerCase(),
};

/** Per-skin defaults. Empty on purpose: every skin uses OPALSWIFT_THEME until it gets its own. */
export const SKIN_DEFAULT_THEMES: Readonly<Record<string, DefaultTheme>> = {};

export function getDefaultTheme(skin?: string | null): DefaultTheme {
  return (skin && SKIN_DEFAULT_THEMES[skin]) || OPALSWIFT_THEME;
}

/** All colour custom properties of a default theme (what index.css :root mirrors). */
export function defaultThemeTokens(skin?: string | null): Record<string, string> {
  const t = getDefaultTheme(skin);
  const colors = deriveColorSystem(t.primary, t.secondary);
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    tokens[`--color-${key.split('_').join('-')}`] = value;
  }
  Object.assign(tokens, deriveSoftTheme(colors.primary, colors.secondary));
  tokens['--color-primary-fill'] = t.ink;
  tokens['--color-primary-fill-hover'] = mix(t.ink, '#000000', 0.91);
  tokens['--color-primary-fill-active'] = mix(t.ink, '#000000', 0.83);
  tokens['--color-primary-ink'] = t.ink;
  Object.assign(tokens, deriveNavTheme(t.primary, t.secondary));
  return tokens;
}
