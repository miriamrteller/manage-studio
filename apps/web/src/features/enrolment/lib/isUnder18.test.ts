import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isUnder18 } from './isUnder18';

describe('isUnder18', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 3)); // 3 Nov 2026
  });
  afterEach(() => vi.useRealTimers());

  it('treats a missing or invalid date as adult', () => {
    expect(isUnder18(null)).toBe(false);
    expect(isUnder18(undefined)).toBe(false);
    expect(isUnder18('')).toBe(false);
    expect(isUnder18('not-a-date')).toBe(false);
  });

  it('is under 18 until the 18th birthday', () => {
    expect(isUnder18('2008-11-10')).toBe(true);
    expect(isUnder18('2008-10-25')).toBe(false);
    expect(isUnder18('2015-01-01')).toBe(true);
    expect(isUnder18('1990-06-15')).toBe(false);
  });
});
