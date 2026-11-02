/**
 * Logo contrast on the tenant header (photographer-theme-proposal.md, 4.4).
 *
 * A logo uploaded for the old solid brand-colour header (often white) can
 * vanish on the light soft header. We measure each logo once (at upload, or
 * on first visit to branding settings) and pick a render-time treatment that
 * keeps it at >= 3:1 against the header. The uploaded file is never changed.
 *
 * WCAG exempts logotypes from text contrast (1.4.3); 3:1 is the non-text
 * contrast level, used here as the visibility target.
 */
import { luminance as hexLuminance } from './color';

export interface LogoTone {
  /** Mean WCAG relative luminance of the logo's visible pixels (0–1). */
  luminance: number;
  /** Close to a single colour (e.g. a white wordmark): safe to recolour. */
  mono: boolean;
  /** Opaque corners: the logo carries its own background box. */
  hasPlate: boolean;
  /** Width / height, for sizing a recoloured (masked) logo. */
  aspect?: number;
}

export const LOGO_MIN_CONTRAST = 3;

const linear = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Tone from raw RGBA pixels (canvas getImageData order). Null if nothing is visible. */
export function toneFromPixels(data: Uint8ClampedArray, width: number, height: number): LogoTone | null {
  let count = 0;
  let lumSum = 0;
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    // Skip transparent and faint pixels; soft fades (alpha >= 0.5) count, so a
    // logo with soft edges is measured by its visible colour.
    if (alpha < 0.5) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    lumSum += 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
    rgb.forEach((v, c) => {
      sum[c] += v;
      sumSq[c] += v * v;
    });
    count += 1;
  }
  if (count === 0) return null;
  const spread = Math.max(...sum.map((s, c) => Math.sqrt(Math.max(0, sumSq[c] / count - (s / count) ** 2))));

  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];
  const corners: [number, number][] = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const hasPlate = width > 2 && height > 2 && corners.every(([x, y]) => alphaAt(x, y) > 230);

  return { luminance: lumSum / count, mono: !hasPlate && spread < 24, hasPlate, aspect: width / height };
}

/** WCAG ratio between a logo's mean luminance and a background colour. */
export function logoContrast(tone: LogoTone, background: string): number {
  const a = tone.luminance;
  const b = hexLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type LogoTreatment =
  | { kind: 'image'; src: string; plate?: boolean }
  | { kind: 'recolour'; src: string; color: string; aspect: number }
  | { kind: 'pill'; src: string; background: string }
  | { kind: 'name' };

export interface LogoInput {
  logoUrl?: string | null;
  logoTone?: LogoTone | null;
  logoDarkUrl?: string | null;
  logoDarkTone?: LogoTone | null;
  /** False when the tenant asked to show the logo exactly as uploaded. */
  autofix?: boolean;
}

export interface HeaderSurface {
  /** Colours the logo can sit on (both ends of a gradient, or one fill). */
  backgrounds: string[];
  /** Colour a one-colour logo is recoloured to (brand ink / on-fill text). */
  recolour: string;
  /** Background of the fallback pill. */
  pill: string;
}

const passes = (tone: LogoTone, surface: HeaderSurface) =>
  surface.backgrounds.every((bg) => logoContrast(tone, bg) >= LOGO_MIN_CONTRAST);

/**
 * First treatment that keeps the logo visible, in the proposal's order:
 * the logo as uploaded, the other uploaded logo, a logo with its own
 * background, a one-colour logo recoloured, then a pill. An unmeasured logo
 * goes on the pill: it was made for the old solid brand header, which the
 * pill reproduces.
 */
export function chooseLogoTreatment(input: LogoInput, surface: HeaderSurface): LogoTreatment {
  const candidates = [
    { src: input.logoUrl, tone: input.logoTone },
    { src: input.logoDarkUrl, tone: input.logoDarkTone },
  ].filter((c): c is { src: string; tone: LogoTone | null | undefined } => Boolean(c.src));
  if (candidates.length === 0) return { kind: 'name' };
  const primary = candidates[0];
  if (input.autofix === false) return { kind: 'image', src: primary.src };

  for (const c of candidates) if (c.tone && passes(c.tone, surface)) return { kind: 'image', src: c.src };
  for (const c of candidates) if (c.tone?.hasPlate) return { kind: 'image', src: c.src, plate: true };
  for (const c of candidates) {
    if (c.tone?.mono) return { kind: 'recolour', src: c.src, color: surface.recolour, aspect: c.tone.aspect ?? 4 };
  }
  return { kind: 'pill', src: primary.src, background: surface.pill };
}

/** Measure an image (File/Blob or URL) in the browser. Null if it can't be read (e.g. CORS). */
export async function analyzeLogo(source: Blob | string): Promise<LogoTone | null> {
  try {
    const bitmap = await loadBitmap(source);
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return toneFromPixels(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return null;
  }
}

function loadBitmap(source: Blob | string): Promise<HTMLImageElement> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (typeof source === 'string') img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error('logo could not be loaded'));
    img.src = url;
  });
}

/** Parse a stored tone (JSONB) defensively. */
export function parseLogoTone(value: unknown): LogoTone | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.luminance !== 'number' || typeof v.mono !== 'boolean' || typeof v.hasPlate !== 'boolean') return null;
  const aspect = typeof v.aspect === 'number' && v.aspect > 0 ? v.aspect : undefined;
  return { luminance: v.luminance, mono: v.mono, hasPlate: v.hasPlate, aspect };
}
