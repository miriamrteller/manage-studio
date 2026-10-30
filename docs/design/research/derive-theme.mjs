/**
 * Prototype of the proposed tenant-derived "soft" token system.
 * Not app code: a reference implementation for the proposal in
 * docs/design/photographer-theme-proposal.md. The production version would live in
 * apps/web/src/lib/theme/deriveSoftTheme.ts and be called from
 * useThemeInjection(). The mockup inlines a copy of deriveSoftTheme().
 *
 *   node docs/design/research/derive-theme.mjs            # contrast matrix (markdown)
 *   node docs/design/research/derive-theme.mjs --json     # tokens per sample tenant
 *
 * All maths is sRGB + WCAG 2.x relative luminance, so the ratios printed are
 * the ones an AA audit would measure.
 */

// ---------- colour helpers ----------
export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
};
export const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex) => { const [r, g, b] = hexToRgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
/** mix(a, b, t): t = share of a (0..1), like color-mix(in srgb, a t, b) */
export const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v * t + B[i] * (1 - t))); };

const toHsl = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = ([h, s, l]) => {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0), f(8), f(4)].map((v) => v * 255));
};

// ---------- constants ----------
export const INK = '#111827';        // body text (gray-900); replaces #1f2937 as the base ink
export const MUTED = '#4b5563';      // muted text (gray-600); replaces #6b7280
export const WHITE = '#ffffff';
const AA = 4.5;

/** Text colour for a fill: whichever of white / ink has the higher WCAG ratio. */
export const onColor = (bg) => (contrast(WHITE, bg) >= contrast(INK, bg) ? WHITE : INK);

/** Smallest mix toward `toward` that gets `color` to `min` against every surface. */
function pushUntil(color, surfaces, toward, min = AA) {
  for (let t = 1; t >= 0; t -= 0.02) {
    const c = mix(color, toward, t);
    if (surfaces.every((s) => contrast(c, s) >= min)) return c;
  }
  return toward;
}

/** Tint of `color` toward white whose luminance is `target` (equal visibility for any hue). */
function tintTo(color, target) {
  if (luminance(color) >= target) return color;
  let lo = 0, hi = 1; // share of colour
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(mix(color, WHITE, mid)) > target) lo = mid; else hi = mid;
  }
  return mix(color, WHITE, lo);
}

/** Accent when the tenant has none: analogous hue (+30°), slightly calmer saturation, same lightness. */
export const analogousAccent = (primary) => { const [h, s, l] = toHsl(primary); return fromHsl([(h + 30) % 360, s * 0.85, l]); };

// Luminance targets: tuned so every tint reads as "a whisper of colour"
// and body ink stays >= 14:1, muted >= 6:1 on all of them.
export const TINT_TARGETS = { ground: 0.97, t1: 0.93, t2: 0.87, t3: 0.78 };

/**
 * The whole derivation. Input: tenant primary + optional accent.
 * Output: CSS custom properties (name -> value). Gradients are composed in
 * CSS from these (see tenant-theme-proposal.md, section 4).
 */
export function deriveSoftTheme(primary, accent) {
  const acc = accent || analogousAccent(primary);
  const t = Object.fromEntries(Object.entries(TINT_TARGETS).map(([k, L]) => [k, tintTo(primary, L)]));
  const a = Object.fromEntries(Object.entries(TINT_TARGETS).map(([k, L]) => [k, tintTo(acc, L)]));
  // Fill for solid buttons: the primary itself if some text colour clears AA on it, else nudge darker.
  const fill = contrast(onColor(primary), primary) >= AA ? primary : pushUntil(primary, [WHITE], '#000000', AA);
  // Brand ink: primary used as TEXT (links, brand name, tinted badges) on the tints it can land on.
  const ink = pushUntil(primary, [WHITE, t.ground, t.t1, t.t2], '#000000', AA);
  const accentInk = pushUntil(acc, [WHITE, a.ground, a.t1, a.t2], '#000000', AA);
  return {
    '--color-primary-fill': fill,
    '--color-on-primary-fill': onColor(fill),
    '--color-on-primary': onColor(primary),
    '--color-primary-ink': ink,
    '--color-accent': acc,
    '--color-accent-ink': accentInk,
    '--color-on-accent': onColor(acc),
    '--tint-ground': t.ground,
    '--tint-1': t.t1,
    '--tint-2': t.t2,
    '--tint-3': t.t3,
    '--tint-accent-1': a.t1,
    '--tint-accent-2': a.t2,
    '--color-text-primary': INK,
    '--color-text-secondary': MUTED,
  };
}

// ---------- current behaviour (for the "today" columns) ----------
export const currentOnColor = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#ffffff';
};

export const SAMPLES = [
  { name: 'Dance studio (current tenant default)', primary: '#76335a', accent: '#e99ac4' },
  { name: 'Photographer demo', primary: '#1F5F5B', accent: '#E8B04B' },
  { name: 'Photographer seed', primary: '#F97316', accent: '#FDE68A' },
  { name: 'Art class seed', primary: '#1D4ED8', accent: '#93C5FD' },
  { name: 'Therapist seed', primary: '#4CAF50', accent: '#C8E6C9' },
  { name: 'Sofer seed', primary: '#6D1A36', accent: '#D4A5B6' },
  { name: 'Stress: light yellow', primary: '#FACC15', accent: null },
  { name: 'Stress: pale sky', primary: '#93C5FD', accent: null },
  { name: 'Stress: near-black', primary: '#111827', accent: null },
];

function matrix() {
  const f = (n) => n.toFixed(2);
  const rows = [
    '| Tenant | Primary / accent | On-primary today → proposed (ratio) | Button fill (ratio) | Primary as text on white → brand ink on tint-2 | Body ink on tint-2 / tint-3 | Muted today → proposed on tint-2 |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const s of SAMPLES) {
    const d = deriveSoftTheme(s.primary, s.accent);
    const cur = currentOnColor(s.primary);
    const t2 = d['--tint-2'], t3 = d['--tint-3'];
    rows.push(`| ${s.name} | \`${s.primary}\` / \`${s.accent ?? `${d['--color-accent']} (derived)`}\` | ${cur === '#000000' ? 'black' : 'white'} ${f(contrast(cur, s.primary))} → ${d['--color-on-primary'] === WHITE ? 'white' : 'ink'} ${f(contrast(d['--color-on-primary'], s.primary))} | \`${d['--color-primary-fill']}\` ${f(contrast(d['--color-on-primary-fill'], d['--color-primary-fill']))} | ${f(contrast(s.primary, WHITE))} → \`${d['--color-primary-ink']}\` ${f(contrast(d['--color-primary-ink'], t2))} | ${f(contrast(INK, t2))} / ${f(contrast(INK, t3))} | ${f(contrast('#6b7280', t2))} → ${f(contrast(MUTED, t2))} |`);
  }
  return rows.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(SAMPLES.map((s) => ({ ...s, tokens: deriveSoftTheme(s.primary, s.accent) })), null, 2));
  } else {
    console.log(matrix());
  }
}
