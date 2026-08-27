import { describe, it, expect } from 'vitest';
import { darkenColor, deriveColorSystem } from '@/lib/utils';

// Every --color-primary-*/--color-secondary-* state variable consumed by the
// stylesheets. useThemeInjection maps each key below to --color-<key with
// dashes>; a key missing from deriveColorSystem leaves the default burgundy
// fallback from index.css visible on tenant themes (the "wrong color on
// hover" bug).
const REQUIRED_KEYS = [
  'primary',
  'primary_light',
  'primary_hover',
  'primary_active',
  'primary_dark',
  'secondary',
  'secondary_light',
  'secondary_hover',
  'secondary_active',
  'secondary_dark',
];

const HEX = /^#[0-9a-f]{6}$/;

describe('deriveColorSystem', () => {
  it('derives every state variable the CSS consumes, as valid hex', () => {
    const system = deriveColorSystem('#0f766e', '#e99ac4');
    for (const key of REQUIRED_KEYS) {
      expect(system[key], `missing or invalid key: ${key}`).toMatch(HEX);
    }
  });

  it('derives hover/active as progressively darker shades of the tenant primary', () => {
    const system = deriveColorSystem('#0f766e');
    const luminance = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(luminance(system.primary_hover)).toBeLessThan(luminance(system.primary));
    expect(luminance(system.primary_active)).toBeLessThan(luminance(system.primary_hover));
    expect(luminance(system.primary_light)).toBeGreaterThan(luminance(system.primary));
  });

  it('falls back to a darkened primary when no secondary is configured', () => {
    const system = deriveColorSystem('#0f766e');
    expect(system.secondary).toBe(darkenColor('#0f766e', 0.15));
    expect(system.secondary_hover).toMatch(HEX);
  });
});

describe('darkenColor', () => {
  it('clamps lightening so bright channels cannot overflow into invalid hex', () => {
    expect(darkenColor('#f0f0f0', -0.15)).toBe('#ffffff');
  });

  it('clamps darkening at black', () => {
    expect(darkenColor('#101010', 0.5)).toBe('#000000');
  });
});
