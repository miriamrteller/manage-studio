import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging Tailwind CSS classes
 * Prevents conflicting Tailwind utilities from being overridden
 * Usage: cn('px-2 py-1', 'px-3') → 'py-1 px-3'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => {
    const hex = x.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  }).join('')}`;
}

/**
 * Convert RGB to HSL
 * Returns [hue (0-360), saturation (0-100), lightness (0-100)]
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255),
  ];
}

/**
 * WCAG relative luminance for contrast calculations
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Pick light or dark text for readable contrast on a given background
 */
export function getAccessibleTextColor(backgroundHex: string): string {
  const [r, g, b] = hexToRgb(backgroundHex);
  const bgLuminance = getRelativeLuminance(r, g, b);

  const lightText = '#ffffff';
  const darkText = '#1f2937';
  const [dr, dg, db] = hexToRgb(darkText);
  const darkLuminance = getRelativeLuminance(dr, dg, db);

  const contrastWithLight = (1 + 0.05) / (bgLuminance + 0.05);
  const contrastWithDark = (bgLuminance + 0.05) / (darkLuminance + 0.05);

  return contrastWithLight >= contrastWithDark ? lightText : darkText;
}

/**
 * Detects if a color is warm or cool based on hue
 * Warm: Reds, Oranges, Yellows (0-60° and 300-360°)
 * Cool: Greens, Cyans, Blues, Purples (60-300°)
 */
export function detectColorTemperature(hexColor: string): 'warm' | 'cool' {
  const [r, g, b] = hexToRgb(hexColor);
  const [hue] = rgbToHsl(r, g, b);
  return hue < 60 || hue > 300 ? 'warm' : 'cool';
}

/**
 * Expand a single color into light/hover/active variants
 * Returns: { base, light, hover (darker), active (darkest) }
 */
function expandColorFamily(
  hexColor: string
): Record<string, string> {
  const [r, g, b] = hexToRgb(hexColor);
  const [hue, saturation, lightness] = rgbToHsl(r, g, b);

  // Base color (input)
  const base = hexColor;

  // Light variant: increase lightness by 20%
  const lightL = Math.min(lightness + 20, 95);
  const [lightR, lightG, lightB] = hslToRgb(hue, saturation, lightL);
  const light = rgbToHex(lightR, lightG, lightB);

  // Hover variant: decrease lightness by 15% (darkened)
  const hoverL = Math.max(lightness - 15, 5);
  const [hoverR, hoverG, hoverB] = hslToRgb(hue, saturation, hoverL);
  const hover = rgbToHex(hoverR, hoverG, hoverB);

  // Active variant: decrease lightness by 25% (much darker)
  const activeL = Math.max(lightness - 25, 5);
  const [activeR, activeG, activeB] = hslToRgb(hue, saturation, activeL);
  const active = rgbToHex(activeR, activeG, activeB);

  return { base, light, hover, active };
}

/**
 * Derive a neutral color scale (50-900) based on primary color's hue and saturation
 * Ensures neutrals feel cohesive with brand (not disconnected gray)
 */
function deriveNeutralScale(primaryHex: string): Record<string, string> {
  const [r, g, b] = hexToRgb(primaryHex);
  const [hue, saturation] = rgbToHsl(r, g, b);

  // Use primary's hue and a low saturation for neutrals
  const neutralSaturation = Math.max(saturation * 0.3, 5); // 30% of primary saturation, min 5%

  const shades: Record<string, string> = {};
  const lightnesses = {
    50: 98,
    100: 96,
    200: 93,
    300: 88,
    400: 76,
    500: 64,
    600: 52,
    700: 40,
    800: 28,
    900: 16,
  };

  Object.entries(lightnesses).forEach(([key, l]) => {
    const [nr, ng, nb] = hslToRgb(hue, neutralSaturation, l);
    shades[`neutral_${key}`] = rgbToHex(nr, ng, nb);
  });

  return shades;
}

/**
 * Derive a complete color system from primary and optional secondary colors
 * Expands each into: base, light, hover, active variants
 * Adds: error, warning, success, info (universal status colors)
 * Adds: neutral scale (50-900) cohesive with primary
 *
 * Example:
 * deriveColorSystem('#76335a', '#e99ac4')
 * Returns:
 * {
 *   primary: '#76335a', primary_light: '#a85a7e', primary_hover: '#5f2549', primary_active: '#4a1c35',
 *   secondary: '#e99ac4', secondary_light: '#f0c0d9', secondary_hover: '#dc7da5', secondary_active: '#cf5987',
 *   error: '#dc2626', error_light: '...', error_hover: '...', error_active: '...',
 *   warning: '#ea580c', success: '#15803d', info: '#0284c7',
 *   neutral_50: '#...', neutral_100: '#...', ... neutral_900: '#...'
 * }
 */
export function deriveColorSystem(
  primaryHex: string,
  secondaryHex?: string
): Record<string, string> {
  const primaryFamily = expandColorFamily(primaryHex);
  const secondaryFamily = secondaryHex
    ? expandColorFamily(secondaryHex)
    : expandColorFamily(primaryHex); // Default to primary if not provided

  // Universal status colors (always same, not derived from primary)
  const errorFamily = expandColorFamily('#dc2626');
  const warningFamily = expandColorFamily('#ea580c');
  const successFamily = expandColorFamily('#15803d');
  const infoFamily = expandColorFamily('#0284c7');

  // Neutral scale derived from primary
  const neutrals = deriveNeutralScale(primaryHex);

  return {
    // Primary color family
    primary: primaryFamily.base,
    primary_light: primaryFamily.light,
    primary_hover: primaryFamily.hover,
    primary_active: primaryFamily.active,

    // Secondary color family (or primary if not provided)
    secondary: secondaryFamily.base,
    secondary_light: secondaryFamily.light,
    secondary_hover: secondaryFamily.hover,
    secondary_active: secondaryFamily.active,

    // Status colors
    error: errorFamily.base,
    error_light: errorFamily.light,
    error_hover: errorFamily.hover,
    error_active: errorFamily.active,

    warning: warningFamily.base,
    warning_light: warningFamily.light,
    warning_hover: warningFamily.hover,
    warning_active: warningFamily.active,

    success: successFamily.base,
    success_light: successFamily.light,
    success_hover: successFamily.hover,
    success_active: successFamily.active,

    info: infoFamily.base,
    info_light: infoFamily.light,
    info_hover: infoFamily.hover,
    info_active: infoFamily.active,

    // Neutral scale
    ...neutrals,
  };
}

/**
 * Get the appropriate background variant (warm or cool) based on primary color temperature
 */
export function getBackgroundForPrimaryColor(
  primaryHex: string
): 'warm' | 'cool' {
  return detectColorTemperature(primaryHex);
}

// Date and utility functions

import { differenceInYears } from 'date-fns';

const JERUSALEM_TZ = 'Asia/Jerusalem';

/**
 * Calculate age from date of birth
 */
export function calculateAge(dateOfBirth: string | Date | null | undefined): number | null {
  if (!dateOfBirth) return null;
  try {
    const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
    return differenceInYears(new Date(), dob);
  } catch {
    return null;
  }
}

/**
 * Check if person is under 18
 */
export function isMinor(dateOfBirth: string | Date | null | undefined): boolean {
  const age = calculateAge(dateOfBirth);
  return age !== null && age < 18;
}

export type StudentAgeDisplay =
  | { kind: 'adult' }
  | { kind: 'age'; value: number }
  | { kind: 'unknown' };

/** Age column display: adults always show as "adult", minors show numeric age. */
export function getStudentAgeDisplay(
  dateOfBirth: string | Date | null | undefined
): StudentAgeDisplay {
  if (!isMinor(dateOfBirth)) {
    return { kind: 'adult' };
  }
  const age = calculateAge(dateOfBirth);
  return age !== null ? { kind: 'age', value: age } : { kind: 'unknown' };
}

/**
 * Format date in Jerusalem timezone using Intl API
 */
export function formatDate(
  date: string | Date | null | undefined
): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: JERUSALEM_TZ,
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * Format currency in Israeli Shekel
 */
export function formatCurrency(amount: number, currency: string = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Validate phone number (international + Israeli formats)
 */
export function isValidPhone(phone: string): boolean {
  const internationalPattern = /^\+?[1-9]\d{1,14}$/;
  const localPattern = /^05\d{8}$/; // Israeli format
  return internationalPattern.test(phone) || localPattern.test(phone);
}

/**
 * Format phone for display
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  // Remove non-digits
  const digits = phone.replace(/\D/g, '');
  // Format as +972-XX-XXX-XXXX (Israeli)
  if (digits.length === 10 && digits.startsWith('5')) {
    return `+972-${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  // Return as-is if non-Israeli
  return phone;
}

/**
 * Generate UUID-like identifier for non-stored data
 */
export function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Debounce utility
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Type-safe object keys
 */
export function objectKeys<T extends Record<string, unknown>>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}
