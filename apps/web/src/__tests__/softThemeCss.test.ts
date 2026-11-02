import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveSoftTheme } from '@/lib/theme/deriveSoftTheme';
import { deriveColorSystem } from '@/lib/utils';
import { defaultThemeTokens, getDefaultTheme, OPALSWIFT_THEME } from '@/lib/theme/defaultTheme';
import { AA, contrast } from '@/lib/theme/color';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

/** Value of `--name` inside the first rule whose selector matches. */
function tokenIn(selector: RegExp, name: string): string {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, sel, body] of rules) {
    if (!selector.test(sel.trim())) continue;
    const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (m) return m[1].replace(/\s+/g, ' ').trim();
  }
  throw new Error(`${name} not found under ${selector}`);
}
const ROOT = /^(\/\*[\s\S]*\*\/\s*)?:root$/;
const RTL = /^(\/\*[\s\S]*\*\/\s*)?\[dir='rtl'\]$/;

describe('soft theme CSS: RTL mirroring', () => {
  it('mirrors the page wash corners', () => {
    const ltr = tokenIn(ROOT, '--wash-page');
    const rtl = tokenIn(RTL, '--wash-page');
    const corners = (v: string) => [...v.matchAll(/at (\d+%) 0%/g)].map((m) => m[1]);
    expect(corners(ltr)).toEqual(['0%', '100%']);
    expect(corners(rtl)).toEqual(['100%', '0%']);
    // Same layers otherwise.
    expect(rtl.replace(/at \d+% 0%/g, '')).toBe(ltr.replace(/at \d+% 0%/g, ''));
  });

  it('mirrors the header gradient direction', () => {
    const ltr = tokenIn(ROOT, '--gradient-header');
    const rtl = tokenIn(RTL, '--gradient-header');
    expect(ltr).toContain('90deg');
    expect(rtl).toContain('270deg');
    expect(rtl.replace('270deg', '90deg')).toBe(ltr);
  });
});

describe('default theme: first paint is the OpalSwift theme', () => {
  it('uses OpalSwift brand colours as :root defaults', () => {
    expect(tokenIn(ROOT, '--color-primary')).toBe('#5b6cff');
    expect(tokenIn(ROOT, '--color-secondary')).toBe('#21d1c2');
    expect(tokenIn(ROOT, '--color-primary-fill')).toBe('#4a58e8');
    expect(css).not.toMatch(/#76335a|#e99ac4/i);
  });

  it('mirrors defaultThemeTokens() in :root (no stale plum/pink)', () => {
    for (const [name, value] of Object.entries(defaultThemeTokens())) {
      expect(tokenIn(ROOT, name), name).toBe(value);
    }
  });

  it('falls back to OpalSwift for any skin until it has its own default', () => {
    expect(getDefaultTheme('dance')).toBe(OPALSWIFT_THEME);
    expect(getDefaultTheme(undefined)).toBe(OPALSWIFT_THEME);
    expect(defaultThemeTokens('photographer')).toEqual(defaultThemeTokens());
  });

  it('keeps default text and buttons WCAG AA', () => {
    const t = defaultThemeTokens();
    expect(contrast(t['--color-on-primary-fill'], t['--color-primary-fill'])).toBeGreaterThanOrEqual(AA);
    expect(contrast('#ffffff', t['--color-primary-fill-hover'])).toBeGreaterThanOrEqual(AA);
    expect(contrast('#ffffff', t['--color-primary-fill-active'])).toBeGreaterThanOrEqual(AA);
    for (const bg of ['#ffffff', t['--tint-ground'], t['--tint-1'], t['--tint-2']]) {
      expect(contrast(t['--color-primary-ink'], bg), `ink on ${bg}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t['--color-text-primary'], bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(t['--color-text-secondary'], bg)).toBeGreaterThanOrEqual(AA);
    }
    expect(contrast(t['--color-accent-ink'], '#ffffff')).toBeGreaterThanOrEqual(AA);
    // dark text on the teal secondary button
    expect(contrast('#111111', t['--color-secondary'])).toBeGreaterThanOrEqual(AA);
  });
});

describe('a studio with its own colours is unchanged', () => {
  it('derives its tokens from its own colours, not from the defaults', () => {
    const soft = deriveSoftTheme('#76335a', '#e99ac4');
    expect(soft['--color-primary-fill']).toBe('#76335a');
    expect(soft['--tint-ground']).toBe('#fdfcfc');
    expect(soft['--color-primary-fill']).not.toBe(defaultThemeTokens()['--color-primary-fill']);
    expect(deriveColorSystem('#76335a', '#e99ac4').primary_hover).toBe('#6b2e52');
  });
});

describe('favicon', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  it('links the OpalSwift favicon and apple-touch-icon', () => {
    expect(html).toMatch(/rel="icon"[^>]*href="\/favicon\.ico"/);
    expect(html).toMatch(/rel="icon"[^>]*href="\/favicon-64\.png"/);
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/);
    expect(html).not.toContain('vite.svg');
  });
  it('ships the linked files', () => {
    for (const f of ['favicon.ico', 'favicon-64.png', 'apple-touch-icon.png']) {
      expect(existsSync(resolve(__dirname, '../../public', f)), f).toBe(true);
    }
  });
});
