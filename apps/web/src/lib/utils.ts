import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BLACK, WHITE, mix, normalizeHex, onColor } from './theme/color';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Color utilities
/**
 * Text colour for a solid background: white or ink (#111827), whichever has
 * the higher WCAG contrast ratio. (Replaced a perceived-brightness threshold
 * that could pick the lower-contrast option for mid-tones.)
 */
export function getAccessibleTextColor(hex: string): string {
  return onColor(hex);
}

export function darkenColor(hex: string, amount: number): string {
  // Clamp both ends: a negative amount (lighten) on a bright channel could
  // exceed 255 and emit a 3-digit channel, corrupting the hex string.
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = clamp(parseInt(hex.slice(1, 3), 16) - Math.round(255 * amount));
  const g = clamp(parseInt(hex.slice(3, 5), 16) - Math.round(255 * amount));
  const b = clamp(parseInt(hex.slice(5, 7), 16) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getBackgroundForPrimaryColor(hex: string): 'warm' | 'cool' {
  const r = parseInt(hex.slice(1, 3), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r > b ? 'warm' : 'cool';
}

/**
 * Shade (toward black) or tint (toward white) by mixing, like CSS
 * color-mix(in srgb). Unlike darkenColor's even RGB subtraction this keeps
 * the hue, so hover/active states stay the same colour family.
 */
const shade = (hex: string, amount: number) => mix(hex, BLACK, 1 - amount);
const tint = (hex: string, amount: number) => mix(hex, WHITE, 1 - amount);

export function deriveColorSystem(primaryInput: string, secondaryInput?: string): Record<string, string> {
  const primary = normalizeHex(primaryInput);
  const sec = secondaryInput ? normalizeHex(secondaryInput) : darkenColor(primary, 0.15);
  // Must cover EVERY --color-primary-*/--color-secondary-* state variable the
  // CSS consumes (hover, active, light, dark). Any key missing here leaves the
  // default burgundy fallback from index.css visible on tenant themes — that
  // is exactly the bug where nav hover/active showed the wrong brand color.
  // Darken amounts mirror the default family's hover (~9%) / active (~17%).
  return {
    primary,
    primary_dark: shade(primary, 0.15),
    primary_light: tint(primary, 0.25),
    primary_hover: shade(primary, 0.09),
    primary_active: shade(primary, 0.17),
    secondary: sec,
    secondary_dark: shade(sec, 0.15),
    secondary_light: tint(sec, 0.25),
    secondary_hover: shade(sec, 0.09),
    secondary_active: shade(sec, 0.17),
  };
}

// Date/age utilities
export function calculateAge(dob: string | Date): number {
  const birth = typeof dob === 'string' ? new Date(dob) : dob;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export type StudentAgeDisplay =
  | { kind: 'age'; value: number }
  | { kind: 'adult' }
  | { kind: 'unknown' };

export function getStudentAgeDisplay(
  dob: string | null | undefined,
  adultThreshold = 18,
): StudentAgeDisplay {
  if (!dob) return { kind: 'unknown' };
  const age = calculateAge(dob);
  if (age >= adultThreshold) return { kind: 'adult' };
  return { kind: 'age', value: age };
}
