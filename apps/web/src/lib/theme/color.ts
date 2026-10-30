/**
 * Colour maths for tenant theming: sRGB hex in, sRGB hex out, with WCAG 2.x
 * relative luminance and contrast ratios, so every value we derive can be
 * checked against the same numbers an accessibility audit uses.
 */

export const INK = '#111827';   // body text
export const MUTED = '#4b5563'; // muted / secondary text
export const WHITE = '#ffffff';
export const BLACK = '#000000';
export const AA = 4.5;

type Rgb = [number, number, number];

/** Accepts #rgb or #rrggbb (any case). Invalid input falls back to black. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: readonly number[]): string {
  return `#${rgb
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Normalises any accepted hex to lowercase #rrggbb. */
export const normalizeHex = (hex: string): string => rgbToHex(hexToRgb(hex));

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Like CSS color-mix(in srgb, a <share*100>%, b). `share` is the amount of `a` (0–1). */
export function mix(a: string, b: string, share: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const t = Math.min(1, Math.max(0, share));
  return rgbToHex(A.map((v, i) => v * t + B[i] * (1 - t)));
}

/** Text colour for a fill: white or ink, whichever has the higher WCAG ratio. */
export function onColor(background: string): string {
  return contrast(WHITE, background) >= contrast(INK, background) ? WHITE : INK;
}

/**
 * The least-changed version of `color`, mixed toward `toward`, that reaches
 * `min` contrast against every surface. Returns `color` itself when it already
 * passes, so dark brand colours are never altered.
 */
export function pushUntilContrast(
  color: string,
  surfaces: readonly string[],
  toward: string = BLACK,
  min: number = AA,
): string {
  for (let step = 50; step >= 0; step -= 1) {
    const candidate = mix(color, toward, step / 50);
    if (surfaces.every((s) => contrast(candidate, s) >= min)) return candidate;
  }
  return toward;
}

/** Mix of `color` with white whose luminance equals `target` (equal visibility for any hue). */
export function tintToLuminance(color: string, target: number): string {
  if (luminance(color) >= target) return normalizeHex(color);
  let lo = 0; // share of colour that is still lighter than target
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (luminance(mix(color, WHITE, mid)) > target) lo = mid;
    else hi = mid;
  }
  return mix(color, WHITE, lo);
}
