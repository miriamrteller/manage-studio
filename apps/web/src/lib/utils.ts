import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Color utilities
export function getAccessibleTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - Math.round(255 * amount));
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - Math.round(255 * amount));
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getBackgroundForPrimaryColor(hex: string): 'warm' | 'cool' {
  const r = parseInt(hex.slice(1, 3), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r > b ? 'warm' : 'cool';
}

export function deriveColorSystem(primary: string, secondary?: string): Record<string, string> {
  const sec = secondary ?? darkenColor(primary, 0.15);
  return {
    primary,
    primary_dark: darkenColor(primary, 0.15),
    primary_light: darkenColor(primary, -0.15),
    secondary: sec,
    secondary_dark: darkenColor(sec, 0.15),
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
