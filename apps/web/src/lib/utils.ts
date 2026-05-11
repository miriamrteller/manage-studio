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
