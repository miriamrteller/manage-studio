import { describe, expect, it } from 'vitest';
import { formatClassAgeRange } from './formatClassAgeRange';

const t = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'pages.classes.ages_range') return `${params?.min}–${params?.max}`;
  if (key === 'pages.classes.ages_min_only') return `${params?.min}+`;
  if (key === 'pages.classes.ages_max_only') return `Up to ${params?.max}`;
  return key;
}) as Parameters<typeof formatClassAgeRange>[0];

describe('formatClassAgeRange', () => {
  it('formats min and max', () => {
    expect(formatClassAgeRange(t, 5, 7)).toBe('5–7');
  });

  it('formats min only', () => {
    expect(formatClassAgeRange(t, 18, null)).toBe('18+');
  });

  it('formats max only', () => {
    expect(formatClassAgeRange(t, null, 12)).toBe('Up to 12');
  });

  it('returns null when both unset', () => {
    expect(formatClassAgeRange(t, null, null)).toBeNull();
  });
});
