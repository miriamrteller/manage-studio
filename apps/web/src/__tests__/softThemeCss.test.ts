import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveSoftTheme } from '@/lib/theme/deriveSoftTheme';
import { deriveColorSystem } from '@/lib/utils';

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

describe('soft theme CSS: first paint matches the default (dance) tenant', () => {
  it('uses the derived values for #76335a / #e99ac4 as :root fallbacks', () => {
    const derived = deriveSoftTheme('#76335a', '#e99ac4');
    for (const [name, value] of Object.entries(derived)) {
      expect(tokenIn(ROOT, name), name).toBe(value);
    }
  });

  it('uses the derived state colours as :root fallbacks', () => {
    const system = deriveColorSystem('#76335a', '#e99ac4');
    for (const [key, value] of Object.entries(system)) {
      expect(tokenIn(ROOT, `--color-${key.replace('_', '-')}`), key).toBe(value);
    }
  });
});
