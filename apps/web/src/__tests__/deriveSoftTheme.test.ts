import { describe, it, expect } from 'vitest';
import { deriveSoftTheme, TINT_TARGETS } from '@/lib/theme/deriveSoftTheme';
import { AA, INK, WHITE, contrast, luminance } from '@/lib/theme/color';
import { deriveColorSystem, getAccessibleTextColor } from '@/lib/utils';

// The contrast matrix from docs/design/photographer-theme-proposal.md, section 5.
const SAMPLES: [name: string, primary: string, accent: string][] = [
  ['dance studio default', '#76335a', '#e99ac4'],
  ['photographer demo', '#1F5F5B', '#E8B04B'],
  ['photographer seed', '#F97316', '#FDE68A'],
  ['art class seed', '#1D4ED8', '#93C5FD'],
  ['therapist seed', '#4CAF50', '#C8E6C9'],
  ['sofer seed', '#6D1A36', '#D4A5B6'],
  ['light yellow', '#FACC15', '#FDE68A'],
  ['pale sky', '#93C5FD', '#DBEAFE'],
  ['near-black', '#111827', '#374151'],
];

// Deterministic PRNG (mulberry32) so failures are reproducible.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = rng(20261030);
const randomHex = () => `#${Math.floor(next() * 0xffffff).toString(16).padStart(6, '0')}`;
const RANDOM: [string, string, string][] = Array.from({ length: 200 }, (_, i) => [`random #${i}`, randomHex(), randomHex()]);

/** Every text-on-surface pairing the theme promises to keep at AA. */
function pairings(primary: string, accent: string): [label: string, fg: string, bg: string][] {
  const t = deriveSoftTheme(primary, accent);
  const primarySurfaces = { white: WHITE, ground: t['--tint-ground'], 'tint-1': t['--tint-1'], 'tint-2': t['--tint-2'] };
  const allTints = { ...primarySurfaces, 'tint-3': t['--tint-3'], 'accent-1': t['--tint-accent-1'], 'accent-2': t['--tint-accent-2'] };
  return [
    ['button text on fill', t['--color-on-primary-fill'], t['--color-primary-fill']],
    ...Object.entries(primarySurfaces).map(([s, bg]): [string, string, string] => [`primary ink on ${s}`, t['--color-primary-ink'], bg]),
    ...Object.entries(allTints).flatMap(([s, bg]): [string, string, string][] => [
      [`body text on ${s}`, t['--color-text-primary'], bg],
      [`secondary text on ${s}`, t['--color-text-secondary'], bg],
    ]),
    ...Object.entries(primarySurfaces).map(([s, bg]): [string, string, string] => [`muted text on ${s}`, t['--color-text-muted'], bg]),
    ['body text on blocked-time grey', t['--color-text-primary'], t['--color-neutral-300']],
    ['accent ink on white', t['--color-accent-ink'], WHITE],
    ['accent ink on accent-1', t['--color-accent-ink'], t['--tint-accent-1']],
    ['accent ink on accent-2', t['--color-accent-ink'], t['--tint-accent-2']],
  ];
}

describe('deriveSoftTheme contrast (WCAG AA, 4.5:1)', () => {
  it.each([...SAMPLES, ...RANDOM])('%s (%s / %s): every pairing passes', (_name, primary, accent) => {
    const failures = pairings(primary, accent)
      .map(([label, fg, bg]) => ({ label, fg, bg, ratio: contrast(fg, bg) }))
      .filter((p) => p.ratio < AA);
    expect(failures).toEqual([]);
  });
});

describe('deriveSoftTheme values', () => {
  it('keeps a dark brand colour unchanged as ink and fill', () => {
    const t = deriveSoftTheme('#76335a', '#e99ac4');
    expect(t['--color-primary-ink']).toBe('#76335a');
    expect(t['--color-primary-fill']).toBe('#76335a');
    expect(t['--color-on-primary-fill']).toBe(WHITE);
  });

  it('darkens a light brand colour for text only', () => {
    const t = deriveSoftTheme('#F97316', '#FDE68A');
    expect(t['--color-primary-fill']).toBe('#f97316');
    expect(contrast('#f97316', WHITE)).toBeLessThan(AA);
    expect(contrast(t['--color-primary-ink'], WHITE)).toBeGreaterThanOrEqual(AA);
  });

  it('puts tints at their luminance targets, lightest to darkest', () => {
    const t = deriveSoftTheme('#1D4ED8', '#93C5FD');
    const order = ['--tint-ground', '--tint-1', '--tint-2', '--tint-3'] as const;
    const targets = [TINT_TARGETS.ground, TINT_TARGETS.t1, TINT_TARGETS.t2, TINT_TARGETS.t3];
    order.forEach((key, i) => expect(luminance(t[key])).toBeCloseTo(targets[i], 2));
  });

  it('accepts #rgb and uppercase input', () => {
    expect(deriveSoftTheme('#FFF', '#ABC')['--tint-ground']).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('tenant-tinted greys', () => {
  it('keeps body text at >= 12:1 on every tint', () => {
    for (const [, primary, accent] of [...SAMPLES, ...RANDOM]) {
      const t = deriveSoftTheme(primary, accent);
      for (const bg of [WHITE, t['--tint-ground'], t['--tint-1'], t['--tint-2'], t['--tint-3'], t['--tint-accent-1'], t['--tint-accent-2']]) {
        expect(contrast(t['--color-text-primary'], bg)).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('orders the neutral scale from light to dark and tints it toward the brand', () => {
    const t = deriveSoftTheme('#1D4ED8', '#93C5FD');
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
    const lum = steps.map((n) => luminance(t[`--color-neutral-${n}`]));
    lum.slice(1).forEach((l, i) => expect(l).toBeLessThan(lum[i]));
    // Blue brand: the dark greys lean blue (blue channel above red).
    const hex = t['--color-neutral-700'];
    expect(parseInt(hex.slice(5, 7), 16)).toBeGreaterThan(parseInt(hex.slice(1, 3), 16));
  });
});

describe('getAccessibleTextColor (WCAG-based)', () => {
  it('picks whichever of white / ink has the higher ratio', () => {
    expect(getAccessibleTextColor('#76335a')).toBe(WHITE);
    expect(getAccessibleTextColor('#FACC15')).toBe(INK);
    expect(getAccessibleTextColor('#9ca3af')).toBe(INK); // white would be 2.5:1
  });
});

describe('deriveColorSystem (mix-based shades)', () => {
  it('keeps hover/active in the same hue family as the primary', () => {
    const system = deriveColorSystem('#1D4ED8', '#93C5FD');
    // Mixing toward black scales channels proportionally, so the ratio between them holds.
    const ratio = (hex: string) => parseInt(hex.slice(5, 7), 16) / parseInt(hex.slice(3, 5), 16); // blue / green
    expect(ratio(system.primary_hover)).toBeCloseTo(ratio('#1d4ed8'), 1);
    expect(ratio(system.primary_active)).toBeCloseTo(ratio('#1d4ed8'), 1);
  });
});
