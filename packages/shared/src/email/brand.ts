/**
 * Email-safe brand colours: the gradient behind the header band, the primary
 * button and the sign-in code.
 *
 * Pure and dependency-free so the Edge Functions (Deno, via email-dist) and the
 * shell build script compute the same values. `fill` is the primary, darkened
 * only as far as needed for white text at WCAG AA; `end` is the fill shifted
 * 25% toward the anchor (OpalSwift: its purple; a studio: its accent), again
 * kept AA with white. Clients without gradient support show `fill` (the
 * bgcolor fallback), so white text is AA there too.
 */

export const OPALSWIFT_EMAIL_FILL = '#4A58E8';
export const OPALSWIFT_EMAIL_ANCHOR = '#9333D6';
const AA = 4.5;
const GRADIENT_SHIFT = 0.25;

function rgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0x4a, 0x58, 0xe8];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(c: readonly number[]): string {
  return '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of white text on `bg`. */
export function whiteContrast(bg: string): number {
  return 1.05 / (luminance(bg) + 0.05);
}

/** `share` of `a`, the rest `b`. */
function mix(a: string, b: string, share: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return toHex(A.map((v, i) => v * share + B[i] * (1 - share)));
}

function darkenForWhite(color: string): string {
  for (let step = 50; step >= 0; step -= 1) {
    const candidate = mix(color, '#000000', step / 50);
    if (whiteContrast(candidate) >= AA) return candidate;
  }
  return '#000000';
}

export interface EmailBrand {
  fill: string;
  end: string;
}

export function deriveEmailBrand(primary: string, anchor: string): EmailBrand {
  const fill = darkenForWhite(primary);
  return { fill, end: darkenForWhite(mix(fill, anchor, 1 - GRADIENT_SHIFT)) };
}

/** CSS for a gradient surface; every client that ignores it falls back to `bgcolor`/`backgroundColor`. */
export function emailGradient(brand: EmailBrand): string {
  return `linear-gradient(135deg, ${brand.fill}, ${brand.end})`;
}

export const OPALSWIFT_EMAIL_BRAND: EmailBrand = deriveEmailBrand(OPALSWIFT_EMAIL_FILL, OPALSWIFT_EMAIL_ANCHOR);
